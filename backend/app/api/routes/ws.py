import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.security import decode_token
from app.websocket.hub import hub

router = APIRouter()


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str | None = None):
    """Protocol: send {"action":"subscribe"|"unsubscribe","keys":["stock:AAPL","crypto:bitcoin","forex:EUR/USD"]}.
    Server pushes {"type":"quote",...,"status":"realtime|delayed|cached|unavailable","mode":"polling"}."""
    uid = decode_token(token) if token else None
    await hub.connect(ws, uid)
    try:
        while True:
            try:
                msg = json.loads(await ws.receive_text())
            except ValueError:
                await ws.send_text(json.dumps({"type": "error", "message": "invalid JSON"}))
                continue
            keys = [k for k in msg.get("keys", []) if isinstance(k, str)][:50]
            if msg.get("action") == "subscribe":
                ok = await hub.subscribe(ws, keys)
                await ws.send_text(json.dumps({"type": "subscribed", "keys": ok}))
            elif msg.get("action") == "unsubscribe":
                await hub.unsubscribe(ws, keys)
            elif msg.get("action") == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(ws)
