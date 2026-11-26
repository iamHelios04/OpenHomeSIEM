# === filename: backend/models/base.py ===
"""Declarative base shared by SQLAlchemy models."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Root for all ORM mappings."""
