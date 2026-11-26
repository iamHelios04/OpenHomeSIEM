# === filename: backend/schemas/device.py ===
"""Device inventory request and response schemas."""

import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator
from utils.time_utils import ensure_utc, parse_datetime


class DeviceCreate(BaseModel):
    """Fields accepted when adding a device manually."""

    mac_address: str | None = Field(default=None, max_length=17)
    ip_address: str | None = Field(default=None, max_length=45)
    hostname: str | None = Field(default=None, max_length=128)
    device_type: str = Field(default="unknown", max_length=32)
    vendor: str | None = Field(default=None, max_length=128)
    notes: str | None = None
    is_trusted: bool = False
    tags: list[str] = Field(default_factory=list)


class DeviceUpdate(BaseModel):
    """Patchable device metadata."""

    hostname: str | None = Field(default=None, max_length=128)
    ip_address: str | None = Field(default=None, max_length=45)
    device_type: str | None = Field(default=None, max_length=32)
    vendor: str | None = Field(default=None, max_length=128)
    notes: str | None = None
    is_trusted: bool | None = None
    tags: list[str] | None = None


class DeviceOut(BaseModel):
    """Device response with decoded tags."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    mac_address: str | None = None
    ip_address: str | None = None
    hostname: str | None = None
    device_type: str
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    total_events: int
    status: str
    vendor: str | None = None
    notes: str | None = None
    is_trusted: bool
    tags: list[str] = Field(default_factory=list)

    @field_validator("tags", mode="before")
    @classmethod
    def decode_tags(cls, value: Any) -> list[str]:
        """Decode the JSON-text tag column."""
        if isinstance(value, list):
            return [str(item) for item in value]
        try:
            items = json.loads(value or "[]")
            return [str(item) for item in items] if isinstance(items, list) else []
        except (TypeError, json.JSONDecodeError):
            return []

    @field_validator("first_seen", "last_seen", mode="before")
    @classmethod
    def normalize_timestamps(cls, value: datetime | str | None) -> datetime | None:
        """Normalize inventory dates to UTC-aware output."""
        parsed = parse_datetime(value)
        return ensure_utc(parsed) if parsed else None


class DevicePage(BaseModel):
    """Paginated device list."""

    items: list[DeviceOut]
    total: int
    page: int
    page_size: int
    pages: int
