# === filename: backend/services/parsers/linux_parser.py ===
"""Linux host syslog parser plugin."""

from services.log_parser import ParsedLog, parse_generic


def parse(raw_line: str, source_device: str = "linux") -> ParsedLog:
    """Parse standard Linux syslog with the generic normalized field set."""
    return parse_generic(raw_line, source_device=source_device, device_type="linux")
