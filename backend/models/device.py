# === filename: backend/models/device.py ===
"""Discovered network device inventory."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base

if TYPE_CHECKING:
    from models.log_record import LogRecord


class Device(Base):
    """A host identified from DHCP, ARP, or explicit inventory data."""

    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mac_address: Mapped[str | None] = mapped_column(String(17), unique=True, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), index=True)
    hostname: Mapped[str | None] = mapped_column(String(128))
    device_type: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    total_events: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="Active")
    vendor: Mapped[str | None] = mapped_column(String(128))
    notes: Mapped[str | None] = mapped_column(Text)
    is_trusted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tags: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    records: Mapped[list["LogRecord"]] = relationship(back_populates="device")
