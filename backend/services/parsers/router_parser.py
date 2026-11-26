# === filename: backend/services/parsers/router_parser.py ===
"""D-Link and common router syslog plugin."""

from services.log_parser import ParsedLog, parse_generic


def parse(raw_line: str, source_device: str = "router") -> ParsedLog:
    """Parse D-Link router events using shared RFC parsers and classifiers."""
    return parse_generic(raw_line, source_device=source_device, device_type="router")
