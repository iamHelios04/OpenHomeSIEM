# === filename: backend/services/anomaly_worker.py ===
"""Async post-ingest detection queue, decoupled from syslog socket callbacks."""

import asyncio
import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from models import LogRecord
from schemas import AnomalyOut
from services.anomaly_engine import detect_and_store
from services.websocket_manager import WebSocketManager

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AnomalyJob:
    """The persisted records and device baseline for one detection pass."""

    record_ids: list[int]
    new_macs: set[str]


class AnomalyJobQueue:
    """In-memory queue that keeps detection work off ingestion callbacks."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[AnomalyJob] = asyncio.Queue()

    @property
    def pending(self) -> int:
        """Return the number of detection batches waiting in memory."""
        return self._queue.qsize()

    async def enqueue(self, record_ids: list[int], new_macs: set[str]) -> None:
        """Schedule a detection pass for committed records."""
        if record_ids:
            await self._queue.put(AnomalyJob(record_ids=record_ids, new_macs=set(new_macs)))

    async def join(self) -> None:
        """Wait until all queued detection jobs have completed."""
        await self._queue.join()

    async def run(self, session_factory: async_sessionmaker, broadcaster: WebSocketManager) -> None:
        """Consume queued detections with retry-on-database-failure behavior."""
        while True:
            job = await self._queue.get()
            delay = 0.25
            try:
                while True:
                    try:
                        async with session_factory() as session:
                            records: list[LogRecord] = []
                            for offset in range(0, len(job.record_ids), 900):
                                chunk_ids = job.record_ids[offset:offset + 900]
                                records.extend((await session.scalars(
                                    select(LogRecord).where(LogRecord.id.in_(chunk_ids)).order_by(LogRecord.timestamp)
                                )).all())
                            records.sort(key=lambda row: row.timestamp)
                            anomalies = await detect_and_store(session, records, job.new_macs)
                            await session.commit()
                            for anomaly in anomalies:
                                await broadcaster.broadcast("anomaly", AnomalyOut.model_validate(anomaly).model_dump(mode="json"))
                        break
                    except asyncio.CancelledError:
                        raise
                    except Exception:
                        logger.exception("Anomaly scan failed; retrying the queued batch")
                        await asyncio.sleep(delay)
                        delay = min(delay * 2, 30)
            finally:
                self._queue.task_done()


anomaly_queue = AnomalyJobQueue()
