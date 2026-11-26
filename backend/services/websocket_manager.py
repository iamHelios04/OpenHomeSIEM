# === filename: backend/services/websocket_manager.py ===
"""Concurrent WebSocket connection registry and real-time event publisher."""

import asyncio
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Track connected clients and isolate failed sends from other clients."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def connection_count(self) -> int:
        """Return the current number of connected browsers."""
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register a socket connection."""
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a socket after close or send failure."""
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, message_type: str, data: dict[str, object]) -> None:
        """Publish one JSON message to each currently connected client."""
        async with self._lock:
            connections = tuple(self._connections)
        if not connections:
            return

        async def send(websocket: WebSocket) -> bool:
            try:
                await websocket.send_json({"type": message_type, "data": data})
                return True
            except Exception:
                return False

        results = await asyncio.gather(*(send(websocket) for websocket in connections), return_exceptions=True)
        failed = {socket for socket, result in zip(connections, results) if result is not True}
        if failed:
            async with self._lock:
                self._connections.difference_update(failed)
            logger.debug("Removed %d stale websocket clients", len(failed))


websocket_manager = WebSocketManager()
