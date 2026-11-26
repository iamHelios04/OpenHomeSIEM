# === filename: backend/utils/pagination.py ===
"""Shared bounded pagination helpers for API list endpoints."""

import math
from typing import Any

from config import settings


def pagination(page: int, page_size: int) -> tuple[int, int]:
    """Return safe offset and limit values under the configured maximum."""
    safe_page = max(1, page)
    safe_size = min(max(1, page_size), settings.max_records_per_query)
    return (safe_page - 1) * safe_size, safe_size


def page_payload(items: list[Any], total: int, page: int, page_size: int) -> dict[str, Any]:
    """Build the standard paginated response metadata."""
    safe_page = max(1, page)
    safe_size = min(max(1, page_size), settings.max_records_per_query)
    return {"items": items, "total": total, "page": safe_page, "page_size": safe_size, "pages": math.ceil(total / safe_size) if total else 0}
