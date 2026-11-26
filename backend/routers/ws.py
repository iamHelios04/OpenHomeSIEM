# === filename: backend/routers/ws.py ===
"""Real-time browser socket endpoint with periodic ping messages."""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.websocket_manager import websocket_manager

router = APIRouter()


@router.websocket("/ws/logs")
async def stream_logs(websocket: WebSocket) -> None:
    """Keep a browser connected and send a JSON ping every thirty seconds."""
    await websocket_manager.connect(websocket)
    try:
        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                try:
                    payload = json.loads(message)
                except json.JSONDecodeError:
                    payload = {}
                if payload.get("type") == "pong":
                    continue
            except TimeoutError:
                await websocket.send_json({"type": "ping", "data": {}})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        await websocket_manager.disconnect(websocket)
