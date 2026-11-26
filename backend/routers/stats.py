# === filename: backend/routers/stats.py ===
"""Dashboard metric aggregation API."""

from collections import Counter
from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Anomaly, Device, LogRecord
from utils.time_utils import ensure_utc, utc_now

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
async def get_stats(session: AsyncSession = Depends(get_db)) -> dict[str, object]:
    """Return event totals, severity counts, type distribution, and 24-hour buckets."""
    total = int(await session.scalar(select(func.count(LogRecord.id)) ) or 0)
    critical = int(await session.scalar(select(func.count(LogRecord.id)).where(LogRecord.severity <= 3)) or 0)
    warning = int(await session.scalar(select(func.count(LogRecord.id)).where(LogRecord.severity == 4)) or 0)
    devices = int(await session.scalar(select(func.count(Device.id))) or 0)
    dns = int(await session.scalar(select(func.count(LogRecord.id)).where(LogRecord.type == "DNS")) or 0)
    leases = int(await session.scalar(select(func.count(LogRecord.id)).where(LogRecord.type == "DHCP", LogRecord.message.ilike("%DHCPACK%"))) or 0)
    blocked = int(await session.scalar(select(func.count(LogRecord.id)).where(LogRecord.type == "Firewall")) or 0)
    anomaly_count = int(await session.scalar(select(func.count(Anomaly.id)).where(Anomaly.resolved.is_(False))) or 0)
    by_type_rows = (await session.execute(select(LogRecord.type, func.count(LogRecord.id)).group_by(LogRecord.type))).all()
    by_type = {str(kind): int(count) for kind, count in by_type_rows}
    since = utc_now() - timedelta(hours=24)
    timestamps = (await session.scalars(select(LogRecord.timestamp).where(LogRecord.timestamp >= since).order_by(LogRecord.timestamp.desc()).limit(10000))).all()
    hourly: Counter[str] = Counter()
    for timestamp in timestamps:
        key = ensure_utc(timestamp).replace(minute=0, second=0, microsecond=0).isoformat()
        hourly[key] += 1
    by_hour = [{"hour": hour, "count": count} for hour, count in sorted(hourly.items())]
    return {"total": total, "critical": critical, "warning": warning, "devices": devices, "dns_queries": dns,
            "dhcp_leases": leases, "blocked": blocked, "anomalies": anomaly_count, "by_type": by_type, "by_hour": by_hour}
