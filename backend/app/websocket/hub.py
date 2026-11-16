"""WebSocket hub.

Clients subscribe to instruments (asset_type:symbol). One poller task per unique subscription fetches
quotes through the provider layer and fans results out to every subscribed client, so duplicate
subscriptions never cause duplicate upstream requests. Each message carries the provider's data status
(realtime / delayed / ...) - we never fabricate ticks. Provider responses are cached (Redis when
REDIS_URL is set), so multiple worker processes share upstream results. Cross-process fan-out of
connected clients is NOT implemented: run a single worker, or add sticky routing."""
import asyncio
import json
import logging
import time

from fastapi import WebSocket

from app.services.quotes import safe_quote

log = logging.getLogger("ws")
MAX_SUBS_PER_CLIENT = 40
POLL_SECONDS = {"stock": 15, "crypto": 60, "forex": 900}


class Hub:
    def __init__(self) -> None:
        self.clients: dict[WebSocket, set[str]] = {}
        self.users: dict[int, set[WebSocket]] = {}
        self.tasks: dict[str, asyncio.Task] = {}
        self.last: dict[str, dict] = {}

    async def connect(self, ws: WebSocket, user_id: int | None) -> None:
        await ws.accept()
        self.clients[ws] = set()
        if user_id:
            self.users.setdefault(user_id, set()).add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        subs = self.clients.pop(ws, set())
        for uid, sockets in list(self.users.items()):
            sockets.discard(ws)
            if not sockets:
                self.users.pop(uid, None)
        for key in subs:
            self._maybe_stop(key)

    def _maybe_stop(self, key: str) -> None:
        if not any(key in s for s in self.clients.values()):
            t = self.tasks.pop(key, None)
            if t:
                t.cancel()
            self.last.pop(key, None)

    async def subscribe(self, ws: WebSocket, keys: list[str]) -> list[str]:
        subs = self.clients[ws]
        accepted = []
        for k in keys:
            if ":" not in k or k.split(":", 1)[0] not in POLL_SECONDS or k in subs:
                continue
            if len(subs) >= MAX_SUBS_PER_CLIENT:
                break
            subs.add(k)
            accepted.append(k)
            if k not in self.tasks:  # prevent duplicate upstream polling
                self.tasks[k] = asyncio.create_task(self._poll(k))
            elif k in self.last:
                await self._send(ws, self.last[k])
        return accepted

    async def unsubscribe(self, ws: WebSocket, keys: list[str]) -> None:
        for k in keys:
            self.clients.get(ws, set()).discard(k)
            self._maybe_stop(k)

    async def _poll(self, key: str) -> None:
        asset_type, symbol = key.split(":", 1)
        interval = POLL_SECONDS[asset_type]
        while True:
            q = await safe_quote(asset_type, symbol)
            msg = {"type": "quote", "key": key, "mode": "polling", "interval_seconds": interval, "server_time": time.time(), **q}
            self.last[key] = msg
            await self._broadcast(key, msg)
            await asyncio.sleep(interval)

    async def _broadcast(self, key: str, msg: dict) -> None:
        for ws, subs in list(self.clients.items()):
            if key in subs:
                await self._send(ws, msg)

    async def _send(self, ws: WebSocket, msg: dict) -> None:
        try:
            await ws.send_text(json.dumps(msg, default=str))
        except Exception:  # noqa: BLE001
            self.disconnect(ws)

    async def publish_user(self, user_id: int, msg: dict) -> None:
        for ws in list(self.users.get(user_id, [])):
            await self._send(ws, msg)


hub = Hub()
