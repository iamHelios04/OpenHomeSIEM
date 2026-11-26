# === filename: backend/models/log_record.py ===
"""Persisted normalized syslog events."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, LargeBinary, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base

if TYPE_CHECKING:
    from models.device import Device


class LogRecord(Base):
    """A normalized router or host log line with extracted investigation fields."""

    __tablename__ = "log_records"
    __table_args__ = (
        Index("ix_log_records_timestamp_type", "timestamp", "type"),
        Index("ix_log_records_source_device_timestamp", "source_device", "timestamp"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    raw: Mapped[str] = mapped_column(Text, nullable=False)
    pri: Mapped[int | None] = mapped_column(Integer)
    facility: Mapped[str | None] = mapped_column(String(32))
    severity: Mapped[int | None] = mapped_column(Integer, index=True)
    severity_name: Mapped[str | None] = mapped_column(String(16))
    severity_group: Mapped[str | None] = mapped_column(String(16), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    host: Mapped[str | None] = mapped_column(String(128))
    process: Mapped[str | None] = mapped_column(String(128), index=True)
    pid: Mapped[str | None] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(32), index=True, nullable=False, default="Other")
    source_ip: Mapped[str | None] = mapped_column(String(45), index=True)
    mac_address: Mapped[str | None] = mapped_column(String(17), index=True)
    lease_ip: Mapped[str | None] = mapped_column(String(45))
    wan_ip: Mapped[str | None] = mapped_column(String(45))
    client_hostname: Mapped[str | None] = mapped_column(String(128))
    domains: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    ips: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    dst_port: Mapped[str | None] = mapped_column(String(8))
    protocol: Mapped[str | None] = mapped_column(String(16))
    device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id", ondelete="SET NULL"), index=True)
    structured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    source_device: Mapped[str] = mapped_column(String(64), nullable=False, default="router", index=True)
    switch_port: Mapped[str | None] = mapped_column(String(32))
    vlan_id: Mapped[str | None] = mapped_column(String(16))
    interface_name: Mapped[str | None] = mapped_column(String(64))
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_tags: Mapped[str | None] = mapped_column(Text)

    device: Mapped["Device | None"] = relationship(back_populates="records")
