# === filename: backend/services/threat_intel.py ===
"""Small local-only indicator lists; no external lookups are performed."""

from utils.ip_utils import normalize_ip
from config import settings

SUSPICIOUS_TLDS = frozenset({".tk", ".xyz", ".ru", ".cn", ".top", ".zip", ".click", ".gq"})
LOCAL_SUSPICIOUS_IPS = frozenset()


def is_suspicious_domain(domain: str | None) -> bool:
    """Return whether a domain ends in one of the local watchlist TLDs."""
    candidate = (domain or "").strip().lower().rstrip(".")
    return any(candidate.endswith(suffix) for suffix in SUSPICIOUS_TLDS)


def is_suspicious_ip(address: str | None) -> bool:
    """Check a normalized IP against the local indicator set."""
    normalized = normalize_ip(address)
    return bool(normalized and (normalized in LOCAL_SUSPICIOUS_IPS or normalized in settings.suspicious_ip_list))
