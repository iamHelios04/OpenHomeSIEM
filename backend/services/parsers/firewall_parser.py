# === filename: backend/services/parsers/firewall_parser.py ===
"""Firewall vendor-independent parser plugin."""

import re

from services.log_parser import ParsedLog, parse_generic


def parse(raw_line: str, source_device: str = "firewall") -> ParsedLog:
    """Normalize common pfSense, OPNsense, and iptables messages."""
    record = parse_generic(raw_line, source_device=source_device, device_type="firewall")
    if re.search(r"drop|block|reject|filterlog|iptables|firewall", record.message, re.I):
        record.type = "Firewall"
    return record
