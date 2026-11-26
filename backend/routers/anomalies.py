# === filename: backend/routers/anomalies.py ===
"""Anomaly feed and analyst resolution API."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from config import settings
from models import Anomaly
from schemas import AnomalyOut, AnomalyPage, AnomalyUpdate
from services.websocket_manager import websocket_manager
from utils.pagination import pagination
from utils.time_utils import utc_now

router = APIRouter(prefix="/anomalies", tags=["anomalies"])


@router.get("", response_model=AnomalyPage)
async def list_anomalies(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1),
    resolved: bool | None = None,
    severity: str | None = None,
    sort_by: str = "newest",
    session: AsyncSession = Depends(get_db),
) -> AnomalyPage:
    """List detections with optional resolved and severity filters."""
    filters = []
    if resolved is not None:
        filters.append(Anomaly.resolved.is_(resolved))
    if severity:
        filters.append(Anomaly.severity == severity[:16])
    total = int(await session.scalar(select(func.count(Anomaly.id)).where(*filters)) or 0)
    offset, limit = pagination(page, page_size)
    ordering = Anomaly.severity.asc() if sort_by == "severity" else Anomaly.detected_at.desc()
    rows = (await session.scalars(select(Anomaly).where(*filters).order_by(ordering, Anomaly.id.desc()).offset(offset).limit(limit))).all()
    actual_size = min(max(page_size, 1), settings.max_records_per_query)
    return AnomalyPage(items=list(rows), total=total, page=page, page_size=actual_size, pages=(total + actual_size - 1) // actual_size if total else 0)


@router.patch("/{anomaly_id}", response_model=AnomalyOut)
async def update_anomaly(anomaly_id: int, payload: AnomalyUpdate, session: AsyncSession = Depends(get_db)) -> Anomaly:
    """Resolve or annotate a detection."""
    anomaly = await session.get(Anomaly, anomaly_id)
    if anomaly is None:
        raise HTTPException(status_code=404, detail="Anomaly not found")
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(anomaly, key, value)
    if payload.resolved is True:
        anomaly.resolved_at = utc_now()
    elif payload.resolved is False:
        anomaly.resolved_at = None
    await session.commit()
    await session.refresh(anomaly)
    await websocket_manager.broadcast("anomaly", AnomalyOut.model_validate(anomaly).model_dump(mode="json"))
    return anomaly
