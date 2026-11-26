# === filename: backend/services/ai_service.py ===
"""Provider-neutral AI extension points, intentionally offline by default."""

from typing import Any

from models import Anomaly, LogRecord


async def summarize_anomaly(anomaly: Anomaly) -> str:
    """Return an offline summary until a vetted model provider is configured."""
    return f"AI enrichment is disabled. Review {anomaly.title}: {anomaly.description}"


async def classify_log(log_record: LogRecord) -> dict[str, Any]:
    """Return a stable classification result without sending data externally."""
    return {
        "enabled": False,
        "type": log_record.type,
        "severity": log_record.severity_name,
        "tags": [],
        "confidence": 0.0,
    }


async def query_logs(natural_language_query: str) -> list[int]:
    """Return no IDs until a local or remote query model is explicitly added."""
    _ = natural_language_query
    return []
