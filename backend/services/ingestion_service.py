# === filename: backend/services/ingestion_service.py ===
"""Shared parse/store/tracker/anomaly pipeline for HTTP and syslog ingestion."""

import json
import logging
from datetime import timedelta
from sqlalchemy.ext.asyncio import AsyncSession

from models import LogRecord
from schemas import DeviceOut, LogRecordOut
from services.anomaly_worker import anomaly_queue
from services.device_tracker import track_log_record
from services.log_parser import parse_syslog
from services.websocket_manager import WebSocketManager
from utils.time_utils import ensure_utc, utc_now

logger = logging.getLogger(__name__)


async def ingest_raw_lines(
    session: AsyncSession,
    lines: list[str],
    source_device: str = "router",
    device_type: str = "router",
    broadcaster: WebSocketManager | None = None,
) -> dict[str, object]:
    """Parse and persist a bounded batch, enqueue detections, and publish stored events."""
    parsed_records: list[LogRecord] = []
    errors: list[dict[str, object]] = []
    for index, raw_line in enumerate(lines):
        if not raw_line or not raw_line.strip():
            continue
        try:
            parsed = parse_syslog(raw_line, device_type=device_type, source_device=source_device)
        except (ValueError, TypeError, OverflowError) as exc:
            errors.append({"line": index + 1, "error": str(exc)[:240]})
            continue
        record = LogRecord(
            raw=parsed.raw,
            pri=parsed.pri,
            facility=parsed.facility,
            severity=parsed.severity,
            severity_name=parsed.severity_name,
            severity_group=parsed.severity_group,
            timestamp=parsed.timestamp,
            host=parsed.host,
            process=parsed.process,
            pid=parsed.pid,
            message=parsed.message,
            type=parsed.type,
            source_ip=parsed.source_ip,
            mac_address=parsed.mac_address,
            lease_ip=parsed.lease_ip,
            wan_ip=parsed.wan_ip,
            client_hostname=parsed.client_hostname,
            domains=json.dumps(parsed.domains, ensure_ascii=False),
            ips=json.dumps(parsed.ips, ensure_ascii=False),
            dst_port=parsed.dst_port,
            protocol=parsed.protocol,
            structured=parsed.structured,
            source_device=parsed.source_device,
            interface_name=parsed.interface_name,
            switch_port=parsed.switch_port,
            vlan_id=parsed.vlan_id,
        )
        session.add(record)
        parsed_records.append(record)

    await session.flush()
    new_devices: list[object] = []
    new_macs: set[str] = set()
    for record in parsed_records:
        device, is_new = await track_log_record(session, record)
        if device:
            if is_new:
                new_devices.append(device)
            if record.mac_address and (is_new or (device.first_seen and ensure_utc(device.first_seen) >= utc_now() - timedelta(minutes=5))) and not device.is_trusted:
                new_macs.add(record.mac_address.upper())

    await session.commit()
    await anomaly_queue.enqueue([record.id for record in parsed_records], new_macs)

    if broadcaster:
        try:
            for record in parsed_records:
                await broadcaster.broadcast("log", LogRecordOut.model_validate(record).model_dump(mode="json"))
            for device in new_devices:
                await broadcaster.broadcast("device", DeviceOut.model_validate(device).model_dump(mode="json"))
        except Exception:
            logger.exception("Records were stored but WebSocket event publication failed")

    logger.info("Stored %d log records from %s; %d parse errors; anomaly scan queued", len(parsed_records), source_device, len(errors))
    return {
        "parsed": len(parsed_records),
        "errors": len(errors),
        "error_details": errors[:100],
        "anomalies_found": 0,
        "analysis_queued": bool(parsed_records),
        "devices_discovered": len(new_devices),
        "records": parsed_records,
        "anomalies": [],
    }
