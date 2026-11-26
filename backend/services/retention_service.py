# === filename: backend/services/retention_service.py ===
"""Archive-first log retention worker."""

import asyncio
import csv
import io
import logging
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker

from config import settings
from models import LogRecord
from services.report_generator import records_to_csv
from utils.time_utils import utc_now

logger = logging.getLogger(__name__)


async def archive_and_purge(session_factory: async_sessionmaker, batch_size: int = 1000) -> int:
    """Archive old rows in bounded batches before deleting each batch."""
    cutoff = utc_now() - timedelta(days=settings.max_log_retention_days)
    settings.archive_path.mkdir(parents=True, exist_ok=True)
    archive_file = settings.archive_path / f"logs-before-{cutoff:%Y%m%d}.csv"
    removed = 0
    while True:
        async with session_factory() as session:
            batch = (await session.scalars(
                select(LogRecord).where(LogRecord.timestamp < cutoff).order_by(LogRecord.timestamp).limit(batch_size)
            )).all()
            if not batch:
                break
            csv_text = records_to_csv(list(batch))
            parsed_csv = list(csv.reader(io.StringIO(csv_text)))
            if not archive_file.exists():
                rows_to_write = parsed_csv
            else:
                rows_to_write = parsed_csv[1:]
            with archive_file.open("a", encoding="utf-8", newline="") as stream:
                writer = csv.writer(stream)
                writer.writerows(rows_to_write)
            ids = [row.id for row in batch]
            await session.execute(delete(LogRecord).where(LogRecord.id.in_(ids)))
            await session.commit()
            removed += len(ids)
    if removed:
        logger.info("Archived and removed %d expired log records to %s", removed, archive_file)
    return removed


async def retention_worker(session_factory: async_sessionmaker) -> None:
    """Run archive-and-purge once per configured retention interval."""
    interval = max(1, settings.retention_check_hours) * 3600
    while True:
        try:
            await archive_and_purge(session_factory)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Retention cycle failed; records were not intentionally removed")
        await asyncio.sleep(interval)
