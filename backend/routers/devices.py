# === filename: backend/routers/devices.py ===
"""Device inventory API."""

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from config import settings
from models import Device
from schemas import DeviceCreate, DeviceOut, DevicePage, DeviceUpdate
from services.websocket_manager import websocket_manager
from utils.pagination import pagination

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=DevicePage)
async def list_devices(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1),
    search: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    session: AsyncSession = Depends(get_db),
) -> DevicePage:
    """Return a paginated device inventory."""
    filters = []
    if search:
        term = f"%{search[:128]}%"
        filters.extend((Device.ip_address.ilike(term), Device.mac_address.ilike(term), Device.hostname.ilike(term), Device.vendor.ilike(term)))
        from sqlalchemy import or_
        filters[-4:] = [or_(*filters[-4:])]
    if status_filter:
        filters.append(Device.status == status_filter[:16])
    total = int(await session.scalar(select(func.count(Device.id)).where(*filters)) or 0)
    offset, limit = pagination(page, page_size)
    rows = (await session.scalars(select(Device).where(*filters).order_by(Device.last_seen.desc().nullslast(), Device.id).offset(offset).limit(limit))).all()
    actual_size = min(max(page_size, 1), settings.max_records_per_query)
    return DevicePage(items=list(rows), total=total, page=page, page_size=actual_size, pages=(total + actual_size - 1) // actual_size if total else 0)


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(device_id: int, session: AsyncSession = Depends(get_db)) -> Device:
    """Return one device by primary key."""
    device = await session.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
async def create_device(payload: DeviceCreate, session: AsyncSession = Depends(get_db)) -> Device:
    """Register a device manually, rejecting duplicate MAC addresses."""
    mac = payload.mac_address.upper().replace("-", ":") if payload.mac_address else None
    if mac and await session.scalar(select(Device.id).where(Device.mac_address == mac)):
        raise HTTPException(status_code=409, detail="A device with this MAC address already exists")
    values = payload.model_dump()
    values["mac_address"] = mac
    values["tags"] = json.dumps(payload.tags)
    device = Device(**values)
    session.add(device)
    await session.commit()
    await session.refresh(device)
    await websocket_manager.broadcast("device", DeviceOut.model_validate(device).model_dump(mode="json"))
    return device


@router.patch("/{device_id}", response_model=DeviceOut)
async def update_device(device_id: int, payload: DeviceUpdate, session: AsyncSession = Depends(get_db)) -> Device:
    """Update editable device fields such as trust, notes, tags, or hostname."""
    device = await session.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    changes = payload.model_dump(exclude_unset=True)
    if "tags" in changes:
        changes["tags"] = json.dumps(changes["tags"] or [])
    for key, value in changes.items():
        setattr(device, key, value)
    await session.commit()
    await session.refresh(device)
    await websocket_manager.broadcast("device", DeviceOut.model_validate(device).model_dump(mode="json"))
    return device
