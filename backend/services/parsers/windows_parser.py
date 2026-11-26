# === filename: backend/services/parsers/windows_parser.py ===
"""Windows Event Log forwarded through syslog parser plugin."""

from services.log_parser import ParsedLog, parse_generic


def parse(raw_line: str, source_device: str = "windows") -> ParsedLog:
    """Normalize forwarded Windows event messages."""
    record = parse_generic(raw_line, source_device=source_device, device_type="windows")
    if record.type == "Other":
        record.type = "System"
    return record
