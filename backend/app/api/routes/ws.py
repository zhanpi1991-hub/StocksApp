import json
import re

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import get_settings
from app.core.security import decode_token
from app.websocket.hub import hub

router = APIRouter()
MAX_MESSAGE_BYTES = 8192


def origin_allowed(origin: str | None) -> bool:
    """Browsers always send Origin on WebSocket handshakes and CORS does not apply to them, so check it
    explicitly (cross-site WebSocket hijacking). Non-browser clients send no Origin and are allowed."""
    if not origin:
        return True
    s = get_settings()
    if origin.rstrip("/") in s.cors_list:
        return True
    return bool(s.cors_origin_regex and re.fullmatch(s.cors_origin_regex, origin))


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    """Protocol (JSON text frames):
      {"action":"auth","token":"<JWT>"}                    optional; enables personal alert pushes
      {"action":"subscribe"|"unsubscribe","keys":["stock:AAPL","crypto:bitcoin","forex:EUR/USD"]}
      {"action":"ping"}                                    keep-alive (idle connections may be closed by proxies)
    The JWT is sent in a message, never in the URL, because URLs are written to access logs.
    Server pushes {"type":"quote",...,"status":"realtime|delayed|cached|unavailable","mode":"polling"}."""
    if not origin_allowed(ws.headers.get("origin")):
        await ws.close(code=1008)  # policy violation
        return
    await hub.connect(ws, None)
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > MAX_MESSAGE_BYTES:
                await ws.close(code=1009)
                return
            try:
                msg = json.loads(raw)
            except ValueError:
                await ws.send_text(json.dumps({"type": "error", "message": "invalid JSON"}))
                continue
            if not isinstance(msg, dict):
                continue
            action = msg.get("action")
            keys = [k for k in msg.get("keys", []) if isinstance(k, str)][:50] if isinstance(msg.get("keys"), list) else []
            if action == "auth":
                token = msg.get("token")
                uid = decode_token(token) if isinstance(token, str) and token else None
                hub.set_user(ws, uid)
                await ws.send_text(json.dumps({"type": "auth", "authenticated": uid is not None}))
            elif action == "subscribe":
                ok = await hub.subscribe(ws, keys)
                await ws.send_text(json.dumps({"type": "subscribed", "keys": ok}))
            elif action == "unsubscribe":
                await hub.unsubscribe(ws, keys)
            elif action == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ws)
