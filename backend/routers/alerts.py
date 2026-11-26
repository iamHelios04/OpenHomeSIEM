# === filename: backend/routers/alerts.py ===
"""Analyst investigation alert API."""

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from config import settings
from models import Alert
from schemas import AlertCreate, AlertOut, AlertPage, AlertUpdate
from utils.pagination import pagination
from utils.time_utils import utc_now

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=AlertPage)
async def list_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1),
    status_filter: str | None = Query(None, alias="status"),
    severity: str | None = None,
    session: AsyncSession = Depends(get_db),
) -> AlertPage:
    """Return paginated analyst alerts."""
    filters = []
    if status_filter:
        filters.append(Alert.status == status_filter[:16])
    if severity:
        filters.append(Alert.severity == severity[:16])
    total = int(await session.scalar(select(func.count(Alert.id)).where(*filters)) or 0)
    offset, limit = pagination(page, page_size)
    rows = (await session.scalars(select(Alert).where(*filters).order_by(Alert.updated_at.desc()).offset(offset).limit(limit))).all()
    actual_size = min(max(page_size, 1), settings.max_records_per_query)
    return AlertPage(items=list(rows), total=total, page=page, page_size=actual_size, pages=(total + actual_size - 1) // actual_size if total else 0)


@router.post("", response_model=AlertOut, status_code=status.HTTP_201_CREATED)
async def create_alert(payload: AlertCreate, session: AsyncSession = Depends(get_db)) -> Alert:
    """Create a new analyst investigation note."""
    alert = Alert(**payload.model_dump(exclude={"related_ids"}), related_ids=json.dumps(payload.related_ids))
    session.add(alert)
    await session.commit()
    await session.refresh(alert)
    return alert


@router.patch("/{alert_id}", response_model=AlertOut)
async def update_alert(alert_id: int, payload: AlertUpdate, session: AsyncSession = Depends(get_db)) -> Alert:
    """Update an alert's status, severity, body, or linked events."""
    alert = await session.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    changes = payload.model_dump(exclude_unset=True)
    if "related_ids" in changes and changes["related_ids"] is not None:
        changes["related_ids"] = json.dumps(changes["related_ids"])
    for key, value in changes.items():
        setattr(alert, key, value)
    alert.updated_at = utc_now()
    await session.commit()
    await session.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(alert_id: int, session: AsyncSession = Depends(get_db)) -> Response:
    """Delete an analyst-created alert after explicit client confirmation."""
    alert = await session.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    await session.delete(alert)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
