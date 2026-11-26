# === filename: backend/services/device_tracker.py ===
"""Device discovery and activity rollups from normalized logs."""

import json
import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Device, LogRecord
from utils.ip_utils import is_private_ip
from utils.time_utils import ensure_utc, utc_now

logger = logging.getLogger(__name__)


async def track_log_record(session: AsyncSession, record: LogRecord) -> tuple[Device | None, bool]:
    """Update a device from an event and return the device plus its new-state flag."""
    mac = record.mac_address.upper().replace("-", ":") if record.mac_address else None
    ip = record.lease_ip or (record.source_ip if is_private_ip(record.source_ip) else None)
    if ip == "192.168.0.1":
        ip = None
    discovery_event = record.type in {"DHCP", "Kernel"} or "arp" in record.message.lower()
    if not mac and not ip:
        return None, False

    cache = session.info.setdefault("device_tracker_cache", {"mac": {}, "ip": {}})
    device: Device | None = cache["mac"].get(mac) if mac else None
    if device is None and ip:
        device = cache["ip"].get(ip)
    if device is None and mac:
        device = await session.scalar(select(Device).where(Device.mac_address == mac))
    if device is None and ip:
        device = await session.scalar(select(Device).where(Device.ip_address == ip).order_by(Device.id).limit(1))
    if device is None and not discovery_event:
        return None, False

    is_new = device is None
    now = ensure_utc(record.timestamp or utc_now())
    if device is None:
        device = Device(
            mac_address=mac,
            ip_address=ip,
            hostname=record.client_hostname,
            device_type="client",
            first_seen=now,
            last_seen=now,
            total_events=0,
            status="Active",
            tags="[]",
            is_trusted=False,
        )
        session.add(device)
        await session.flush()
        logger.info("Discovered device mac=%s ip=%s", mac or "unknown", ip or "unknown")
    else:
        if mac and not device.mac_address:
            device.mac_address = mac
        if ip:
            device.ip_address = ip
        if record.client_hostname:
            device.hostname = record.client_hostname
        if device.first_seen is None or ensure_utc(device.first_seen) > now:
            device.first_seen = now
        if device.last_seen is None or ensure_utc(device.last_seen) < now:
            device.last_seen = now

    device.total_events = (device.total_events or 0) + 1
    last_seen = ensure_utc(device.last_seen or now)
    age = utc_now() - last_seen
    device.status = "Active" if age < timedelta(minutes=5) else "Idle" if age < timedelta(hours=1) else "Gone"
    record.device_id = device.id
    if mac:
        cache["mac"][mac] = device
    if device.mac_address:
        cache["mac"][device.mac_address] = device
    if ip:
        cache["ip"][ip] = device
    if device.ip_address:
        cache["ip"][device.ip_address] = device
    return device, is_new


async def refresh_device_counts(session: AsyncSession) -> int:
    """Recompute inventory activity statuses after bulk data restoration."""
    devices = (await session.scalars(select(Device))).all()
    now = utc_now()
    for device in devices:
        if device.last_seen is None:
            device.status = "Gone"
            continue
        age = now - ensure_utc(device.last_seen)
        device.status = "Active" if age < timedelta(minutes=5) else "Idle" if age < timedelta(hours=1) else "Gone"
        if not device.tags:
            device.tags = json.dumps([])
    await session.flush()
    return len(devices)
