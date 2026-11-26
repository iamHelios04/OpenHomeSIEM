# === filename: backend/utils/ip_utils.py ===
"""IP address parsing and network classification helpers."""

import ipaddress


def normalize_ip(value: str | None) -> str | None:
    """Return a canonical IP string or None for invalid input."""
    if not value:
        return None
    try:
        return str(ipaddress.ip_address(value.strip().strip("[]")))
    except ValueError:
        return None


def is_private_ip(value: str | None) -> bool:
    """Whether an address is an RFC1918/ULA private address."""
    normalized = normalize_ip(value)
    if not normalized:
        return False
    return ipaddress.ip_address(normalized).is_private


def is_public_ip(value: str | None) -> bool:
    """Whether an address is routable public unicast."""
    normalized = normalize_ip(value)
    if not normalized:
        return False
    address = ipaddress.ip_address(normalized)
    return address.is_global and not address.is_multicast


def is_internal_ip(value: str | None) -> bool:
    """Alias used by detection rules for non-public addresses."""
    normalized = normalize_ip(value)
    if not normalized:
        return False
    address = ipaddress.ip_address(normalized)
    if address.version == 4:
        return any(address in ipaddress.ip_network(network) for network in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
    return address.is_private and not address.is_link_local and not address.is_loopback


def ip_version(value: str | None) -> int | None:
    """Return address family number for a valid IP address."""
    normalized = normalize_ip(value)
    return ipaddress.ip_address(normalized).version if normalized else None
