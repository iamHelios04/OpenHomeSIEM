# === filename: backend/schemas/anomaly.py ===
"""Anomaly API schemas."""

import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator
from utils.time_utils import ensure_utc, parse_datetime


class AnomalyUpdate(BaseModel):
    """Fields allowed when an analyst resolves or annotates a detection."""

    resolved: bool | None = None
    notes: str | None = None


class AnomalyOut(BaseModel):
    """Rule detection with decoded event evidence IDs."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    rule_id: str
    severity: str
    title: str
    description: str
    evidence_ids: list[int] = Field(default_factory=list)
    source_ip: str | None = None
    detected_at: datetime
    resolved: bool
    resolved_at: datetime | None = None
    notes: str | None = None

    @field_validator("evidence_ids", mode="before")
    @classmethod
    def decode_evidence(cls, value: Any) -> list[int]:
        """Decode the JSON-text evidence column."""
        if isinstance(value, list):
            return [int(item) for item in value]
        try:
            items = json.loads(value or "[]")
            return [int(item) for item in items] if isinstance(items, list) else []
        except (TypeError, ValueError, json.JSONDecodeError):
            return []

    @field_validator("detected_at", "resolved_at", mode="before")
    @classmethod
    def normalize_timestamps(cls, value: datetime | str | None) -> datetime | None:
        """Normalize detection timestamps to UTC-aware output."""
        parsed = parse_datetime(value)
        return ensure_utc(parsed) if parsed else None


class AnomalyPage(BaseModel):
    """Paginated anomaly list."""

    items: list[AnomalyOut]
    total: int
    page: int
    page_size: int
    pages: int
