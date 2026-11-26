# === filename: backend/services/parsers/ids_parser.py ===
"""IDS/IPS alert parser plugin."""

import re

from services.log_parser import ParsedLog, parse_generic


def parse(raw_line: str, source_device: str = "ids") -> ParsedLog:
    """Normalize Snort and Suricata style alert events."""
    record = parse_generic(raw_line, source_device=source_device, device_type="ids")
    if re.search(r"alert|signature|sid=|suricata|snort", record.message, re.I):
        record.type = "Firewall"
        record.severity = min(record.severity, 3)
        record.severity_name = ("Emergency", "Alert", "Critical", "Error", "Warning", "Notice", "Info", "Debug")[record.severity]
        record.severity_group = "Critical"
    return record
