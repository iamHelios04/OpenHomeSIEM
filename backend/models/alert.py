# === filename: backend/models/alert.py ===
"""Analyst-created investigations and notes."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from models.base import Base


class Alert(Base):
    """An analyst workspace item linked to one or more event IDs."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", index=True)
    related_ids: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
