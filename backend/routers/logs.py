# === filename: backend/routers/logs.py ===
"""Filterable paginated log record API."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from config import settings
from models import LogRecord
from schemas import LogPage
from utils.pagination import pagination
from utils.time_utils import parse_datetime

router = APIRouter(prefix="/logs", tags=["logs"])
SORT_COLUMNS = {
    "timestamp": LogRecord.timestamp,
    "ingested_at": LogRecord.ingested_at,
    "severity": LogRecord.severity,
    "source_ip": LogRecord.source_ip,
    "type": LogRecord.type,
    "process": LogRecord.process,
    "host": LogRecord.host,
    "id": LogRecord.id,
}


@router.get("", response_model=LogPage)
async def list_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1),
    type: str | None = None,
    severity_group: str | None = None,
    source_ip: str | None = None,
    process: str | None = None,
    domain: str | None = None,
    search: str | None = None,
    from_time: str | None = None,
    to_time: str | None = None,
    sort_by: str = "timestamp",
    sort_dir: str = "desc",
    source_device: str | None = None,
    session: AsyncSession = Depends(get_db),
) -> LogPage:
    """Return logs matching validated query filters and bounded pagination."""
    filters = []
    if type:
        filters.append(LogRecord.type == type[:32])
    if severity_group:
        filters.append(LogRecord.severity_group == severity_group[:16])
    if source_ip:
        filters.append(LogRecord.source_ip == source_ip[:45])
    if process:
        filters.append(LogRecord.process == process[:128])
    if domain:
        filters.append(LogRecord.domains.ilike(f"%{domain[:253].lower()}%"))
    if source_device:
        filters.append(LogRecord.source_device == source_device[:64])
    if search:
        term = f"%{search[:240]}%"
        filters.append(or_(LogRecord.message.ilike(term), LogRecord.raw.ilike(term), LogRecord.host.ilike(term), LogRecord.process.ilike(term), LogRecord.source_ip.ilike(term)))
    try:
        start = parse_datetime(from_time)
        end = parse_datetime(to_time)
    except (ValueError, TypeError, OverflowError) as exc:
        raise HTTPException(status_code=422, detail="Invalid time range") from exc
    if start:
        filters.append(LogRecord.timestamp >= start)
    if end:
        filters.append(LogRecord.timestamp <= end)
    if start and end and start > end:
        raise HTTPException(status_code=422, detail="from_time must not be later than to_time")

    total = int(await session.scalar(select(func.count(LogRecord.id)).where(*filters)) or 0)
    offset, limit = pagination(page, page_size)
    column = SORT_COLUMNS.get(sort_by, LogRecord.timestamp)
    ordering = column.asc() if sort_dir.lower() == "asc" else column.desc()
    rows = (await session.scalars(select(LogRecord).where(*filters).order_by(ordering, LogRecord.id.desc()).offset(offset).limit(limit))).all()
    actual_page_size = min(max(page_size, 1), settings.max_records_per_query)
    return LogPage(items=list(rows), total=total, page=page, page_size=actual_page_size, pages=(total + actual_page_size - 1) // actual_page_size if total else 0)


@router.get("/options")
async def log_filter_options(session: AsyncSession = Depends(get_db)) -> dict[str, list[str]]:
    """Return distinct, bounded source/type values for explorer filter controls."""
    source_ips = (await session.scalars(select(LogRecord.source_ip).where(LogRecord.source_ip.is_not(None)).distinct().order_by(LogRecord.source_ip).limit(10000))).all()
    source_devices = (await session.scalars(select(LogRecord.source_device).distinct().order_by(LogRecord.source_device).limit(1000))).all()
    types = (await session.scalars(select(LogRecord.type).distinct().order_by(LogRecord.type).limit(100))).all()
    return {"source_ips": [value for value in source_ips if value], "source_devices": [value for value in source_devices if value], "types": [value for value in types if value]}


@router.get("/{record_id}")
async def get_log(record_id: int, session: AsyncSession = Depends(get_db)) -> dict[str, object]:
    """Return one event by ID for alert evidence and analyst detail views."""
    record = await session.get(LogRecord, record_id)
    if record is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Log record not found")
    from schemas import LogRecordOut
    return LogRecordOut.model_validate(record).model_dump(mode="json")
