# === filename: backend/services/syslog_server.py ===
"""Async UDP/514 and newline-delimited TCP/601 syslog listeners."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from config import settings
from services.ingestion_service import ingest_raw_lines
from services.websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)
QueueItem = tuple[str, str]


class SyslogDatagramProtocol(asyncio.DatagramProtocol):
    """Queue UDP datagrams without doing database work on the event callback."""

    def __init__(self, queue: asyncio.Queue[QueueItem]) -> None:
        self.queue = queue
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        """Save the active datagram transport."""
        self.transport = transport  # type: ignore[assignment]

    def datagram_received(self, data: bytes, address: tuple[str, int]) -> None:
        """Decode and enqueue each line in a received datagram."""
        sender = address[0]
        text = data.decode("utf-8", errors="replace")
        for line in text.splitlines() or [text]:
            if line.strip():
                self.queue.put_nowait((sender, line[: settings.max_ingest_line_length]))

    def error_received(self, exc: Exception) -> None:
        """Log UDP socket errors for operations visibility."""
        logger.warning("Syslog UDP socket reported an error: %s", exc)


@dataclass
class SyslogRuntime:
    """Owned listener resources closed by the application lifespan."""

    queue: asyncio.Queue[QueueItem]
    udp_started: bool = False
    tcp_started: bool = False
    transports: list[asyncio.DatagramTransport] = field(default_factory=list)
    servers: list[asyncio.AbstractServer] = field(default_factory=list)
    tasks: list[asyncio.Task[Any]] = field(default_factory=list)

    async def close(self) -> None:
        """Stop sockets and background worker tasks cleanly."""
        for transport in self.transports:
            transport.close()
        for server in self.servers:
            server.close()
            await server.wait_closed()
        for task in self.tasks:
            task.cancel()
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)


async def _tcp_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, queue: asyncio.Queue[QueueItem]) -> None:
    """Read newline-delimited TCP syslog with a bounded line size."""
    address = writer.get_extra_info("peername")
    sender = str(address[0]) if address else "unknown"
    try:
        while line := await reader.readline():
            if len(line) > settings.max_ingest_line_length:
                logger.warning("Dropped oversized TCP syslog line from %s", sender)
                continue
            text = line.decode("utf-8", errors="replace").strip()
            if text:
                await queue.put((sender, text))
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except ConnectionError:
            pass


async def _worker(queue: asyncio.Queue[QueueItem], session_factory: async_sessionmaker, broadcaster: WebSocketManager) -> None:
    """Batch queued messages by sender and persist them asynchronously."""
    batch_limit = max(1, settings.syslog_batch_size)
    timeout = max(0.01, settings.syslog_batch_wait_ms / 1000)
    while True:
        first = await queue.get()
        batch = [first]
        deadline = asyncio.get_running_loop().time() + timeout
        while len(batch) < batch_limit:
            try:
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    break
                batch.append(await asyncio.wait_for(queue.get(), timeout=remaining))
            except TimeoutError:
                break
        grouped: dict[str, list[str]] = {}
        for sender, line in batch:
            grouped.setdefault(sender, []).append(line)
        try:
            for sender, lines in grouped.items():
                delay = 0.25
                while True:
                    try:
                        async with session_factory() as session:
                            await ingest_raw_lines(session, lines, source_device=f"syslog:{sender}", device_type="router", broadcaster=broadcaster)
                        break
                    except asyncio.CancelledError:
                        raise
                    except Exception:
                        logger.exception("Syslog batch for %s failed; retrying without discarding queued lines", sender)
                        await asyncio.sleep(delay)
                        delay = min(delay * 2, 30)
        finally:
            for _ in batch:
                queue.task_done()


async def start_syslog_servers(session_factory: async_sessionmaker, broadcaster: WebSocketManager) -> SyslogRuntime:
    """Start configured listeners; return a runtime handle for shutdown."""
    queue: asyncio.Queue[QueueItem] = asyncio.Queue()
    runtime = SyslogRuntime(queue=queue)
    runtime.tasks.append(asyncio.create_task(_worker(queue, session_factory, broadcaster), name="syslog-ingestion-worker"))
    try:
        loop = asyncio.get_running_loop()
        transport, _ = await loop.create_datagram_endpoint(
            lambda: SyslogDatagramProtocol(queue),
            local_addr=(settings.syslog_udp_host, settings.syslog_udp_port),
        )
        runtime.transports.append(transport)  # type: ignore[arg-type]
        runtime.udp_started = True
        logger.info("Syslog UDP listener bound to %s:%d", settings.syslog_udp_host, settings.syslog_udp_port)
    except OSError:
        logger.exception("Could not bind syslog UDP listener at %s:%d", settings.syslog_udp_host, settings.syslog_udp_port)
    try:
        server = await asyncio.start_server(
            lambda reader, writer: _tcp_client(reader, writer, queue),
            settings.syslog_tcp_host,
            settings.syslog_tcp_port,
            limit=settings.max_ingest_line_length + 1,
        )
        runtime.servers.append(server)
        runtime.tcp_started = True
        logger.info("Syslog TCP listener bound to %s:%d", settings.syslog_tcp_host, settings.syslog_tcp_port)
    except OSError:
        logger.exception("Could not bind syslog TCP listener at %s:%d", settings.syslog_tcp_host, settings.syslog_tcp_port)
    return runtime
