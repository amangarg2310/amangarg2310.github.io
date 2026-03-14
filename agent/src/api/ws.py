from __future__ import annotations

import asyncio
import collections
import json
import time
from typing import Any

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = structlog.get_logger()

router = APIRouter()

RING_BUFFER_SIZE = 2000


class EventBroadcaster:
    """Manages WebSocket connections and broadcasts events to all clients.

    Maintains a ring buffer of the most recent events so that newly connected
    clients can catch up on missed activity.
    """

    def __init__(self, buffer_size: int = RING_BUFFER_SIZE) -> None:
        self._connections: list[WebSocket] = []
        self._buffer: collections.deque[dict[str, Any]] = collections.deque(
            maxlen=buffer_size,
        )
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection.

        Sends any buffered events so the client can catch up.
        """
        await websocket.accept()
        async with self._lock:
            self._connections.append(websocket)
        logger.info("ws_client_connected", total=len(self._connections))

        # Send buffered events for catch-up
        for event in self._buffer:
            try:
                await websocket.send_json(event)
            except Exception:
                break

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection from the active set."""
        async with self._lock:
            try:
                self._connections.remove(websocket)
            except ValueError:
                pass
        logger.info("ws_client_disconnected", total=len(self._connections))

    async def broadcast(self, event: dict) -> None:
        """Send *event* to every connected client and store it in the ring buffer."""
        stamped_event = {**event, "_ts": time.time()}
        self._buffer.append(stamped_event)

        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_json(stamped_event)
            except Exception:
                dead.append(ws)

        # Clean up broken connections
        if dead:
            async with self._lock:
                for ws in dead:
                    try:
                        self._connections.remove(ws)
                    except ValueError:
                        pass


# Singleton broadcaster used across the application
broadcaster = EventBroadcaster()


@router.websocket("/ws/events")
async def ws_events(websocket: WebSocket):
    """WebSocket endpoint for live event streaming."""
    await broadcaster.connect(websocket)
    try:
        while True:
            # Keep the connection alive; optionally handle incoming messages
            data = await websocket.receive_text()
            # Clients can send a ping / subscribe message; for now we just acknowledge
            await websocket.send_json({"type": "ack", "data": data})
    except WebSocketDisconnect:
        await broadcaster.disconnect(websocket)
    except Exception:
        await broadcaster.disconnect(websocket)
