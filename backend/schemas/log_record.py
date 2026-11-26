# === filename: backend/schemas/log_record.py ===
"""Pydantic contracts for ingestion and log-record responses."""

import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator
from utils.time_utils import ensure_utc, parse_datetime


class LogRecordOut(BaseModel):
    """Public normalized event representation."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    raw: str
    pri: int | None = None
    facility: str | None = None
    severity: int | None = None
    severity_name: str | None = None
    severity_group: str | None = None
    timestamp: datetime
    host: str | None = None
    process: str | None = None
    pid: str | None = None
    message: str
    type: str
    source_ip: str | None = None
    mac_address: str | None = None
    lease_ip: str | None = None
    wan_ip: str | None = None
    client_hostname: str | None = None
    domains: list[str] = Field(default_factory=list)
    ips: list[str] = Field(default_factory=list)
    dst_port: str | None = None
    protocol: str | None = None
    device_id: int | None = None
    structured: bool = False
    ingested_at: datetime | None = None
    source_device: str = "router"
    switch_port: str | None = None
    vlan_id: str | None = None
    interface_name: str | None = None
    ai_summary: str | None = None
    ai_tags: list[str] = Field(default_factory=list)

    @field_validator("domains", "ips", "ai_tags", mode="before")
    @classmethod
    def decode_json_list(cls, value: Any) -> list[str]:
        """Convert the JSON-text ORM representation into an API list."""
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return [str(item) for item in value]
        try:
            decoded = json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return []
        return [str(item) for item in decoded] if isinstance(decoded, list) else []

    @field_validator("timestamp", "ingested_at", mode="before")
    @classmethod
    def normalize_timestamp(cls, value: datetime | str | None) -> datetime | None:
        """Expose all event timestamps as UTC-aware ISO values."""
        parsed = parse_datetime(value)
        return ensure_utc(parsed) if parsed else None


class LogPage(BaseModel):
    """Paginated log response."""

    items: list[LogRecordOut]
    total: int
    page: int
    page_size: int
    pages: int


class IngestRequest(BaseModel):
    """Bounded raw line batch submitted by the UI or an integration."""

    lines: list[str] = Field(min_length=1)
    source_device: str = Field(default="router", max_length=64)
    device_type: str = Field(default="router", max_length=32)


class IngestResponse(BaseModel):
    """Summary returned after a batch has been parsed and stored."""

    parsed: int
    errors: int
    anomalies_found: int
    devices_discovered: int = 0
    analysis_queued: bool = True
