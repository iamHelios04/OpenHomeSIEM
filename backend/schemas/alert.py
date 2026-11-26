# === filename: backend/schemas/alert.py ===
"""Analyst alert schemas."""

import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator
from utils.time_utils import ensure_utc, parse_datetime


class AlertCreate(BaseModel):
    """Create a new investigation note."""

    title: str = Field(min_length=1, max_length=256)
    body: str = ""
    severity: str = Field(default="medium", pattern="^(critical|high|medium|low|info)$")
    status: str = Field(default="open", pattern="^(open|investigating|closed)$")
    related_ids: list[int] = Field(default_factory=list)


class AlertUpdate(BaseModel):
    """Patch an investigation note."""

    title: str | None = Field(default=None, min_length=1, max_length=256)
    body: str | None = None
    severity: str | None = Field(default=None, pattern="^(critical|high|medium|low|info)$")
    status: str | None = Field(default=None, pattern="^(open|investigating|closed)$")
    related_ids: list[int] | None = None


class AlertOut(BaseModel):
    """Alert response with event links decoded."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    body: str
    severity: str
    status: str
    related_ids: list[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    @field_validator("related_ids", mode="before")
    @classmethod
    def decode_related_ids(cls, value: Any) -> list[int]:
        """Decode the JSON-text related ID column."""
        if isinstance(value, list):
            return [int(item) for item in value]
        try:
            items = json.loads(value or "[]")
            return [int(item) for item in items] if isinstance(items, list) else []
        except (TypeError, ValueError, json.JSONDecodeError):
            return []

    @field_validator("created_at", "updated_at", mode="before")
    @classmethod
    def normalize_timestamps(cls, value: datetime | str | None) -> datetime | None:
        """Normalize investigation timestamps to UTC-aware output."""
        parsed = parse_datetime(value)
        return ensure_utc(parsed) if parsed else None


class AlertPage(BaseModel):
    """Paginated analyst alert list."""

    items: list[AlertOut]
    total: int
    page: int
    page_size: int
    pages: int
