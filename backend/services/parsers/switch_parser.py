# === filename: backend/services/parsers/switch_parser.py ===
"""Generic switch syslog plugin."""

import re

from services.log_parser import ParsedLog, parse_generic


def parse(raw_line: str, source_device: str = "switch") -> ParsedLog:
    """Parse switch events and extract a port when present."""
    record = parse_generic(raw_line, source_device=source_device, device_type="switch")
    port = re.search(r"\b(?:interface|port| Gi| Fa)(?:=|\s+)?([A-Za-z]*\d+(?:/\d+){0,2})\b", record.message, re.I)
    record.switch_port = port.group(1) if port else None
    if record.type == "Other":
        record.type = "Kernel" if re.search(r"link|interface|port|vlan", record.message, re.I) else "System"
    return record
