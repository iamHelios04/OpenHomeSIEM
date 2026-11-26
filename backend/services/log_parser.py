# === filename: backend/services/log_parser.py ===
"""Syslog normalization for RFC 3164, RFC 5424, Tftpd64, and plain text."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable
from zoneinfo import ZoneInfo

from config import settings
from utils.ip_utils import is_private_ip, normalize_ip
from utils.time_utils import parse_datetime

SEVERITY_NAMES = ("Emergency", "Alert", "Critical", "Error", "Warning", "Notice", "Info", "Debug")
FACILITIES = (
    "kern", "user", "mail", "daemon", "auth", "syslog", "lpr", "news", "uucp", "clock",
    "authpriv", "ftp", "ntp", "audit", "alert", "clock2", "local0", "local1", "local2",
    "local3", "local4", "local5", "local6", "local7",
)
RFC3164 = re.compile(
    r"^(?:<(?P<pri>\d{1,3})>)?(?P<month>[A-Z][a-z]{2})\s+(?P<day>\d{1,2})\s+"
    r"(?P<hour>\d{2}):(?P<minute>\d{2}):(?P<second>\d{2})\s+(?P<host>\S+)\s+"
    r"(?P<process>[^:\s\[]+)(?:\[(?P<pid>[^\]]+)\])?:\s*(?P<message>.*)$"
)
RFC3164_NOHOST = re.compile(
    r"^(?:<(?P<pri>\d{1,3})>)?(?P<month>[A-Z][a-z]{2})\s+(?P<day>\d{1,2})\s+"
    r"(?P<hour>\d{2}):(?P<minute>\d{2}):(?P<second>\d{2})\s+"
    r"(?P<process>[^:\s\[]+)(?:\[(?P<pid>[^\]]+)\])?:\s*(?P<message>.*)$"
)
RFC5424 = re.compile(
    r"^<(?P<pri>\d{1,3})>(?P<version>\d)\s+(?P<timestamp>\S+)\s+(?P<host>\S+)\s+"
    r"(?P<process>\S+)\s+(?P<pid>\S+)\s+(?P<msgid>\S+)\s+(?P<sd>(?:\[[^\]]*\]|-))"
    r"(?:\s+(?P<message>.*))?$"
)
IP_PATTERN = re.compile(r"(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])")
MAC_PATTERN = re.compile(r"\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b", re.I)
DOMAIN_PATTERN = re.compile(r"\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}\b", re.I)


@dataclass(slots=True)
class ParsedLog:
    """Normalized event shape shared by parser plugins and storage code."""

    raw: str
    pri: int | None
    facility: str | None
    severity: int
    severity_name: str
    severity_group: str
    timestamp: datetime
    host: str
    process: str
    pid: str | None
    message: str
    type: str
    source_ip: str | None
    mac_address: str | None
    lease_ip: str | None
    wan_ip: str | None
    client_hostname: str | None
    domains: list[str]
    ips: list[str]
    dst_port: str | None
    protocol: str | None
    structured: bool
    source_device: str
    interface_name: str | None = None
    switch_port: str | None = None
    vlan_id: str | None = None


def _severity_group(level: int) -> str:
    """Map RFC severity values into operator filter groups."""
    if level <= 3:
        return "Critical"
    if level == 4:
        return "Warning"
    if level <= 6:
        return "Info"
    return "Debug"


def _classify(process: str, message: str) -> str:
    """Classify common D-Link and general-purpose network log messages."""
    proc = process.lower()
    text = message.lower()
    if "dnsmasq-dhcp" in proc or re.search(r"\bdhcp(discover|offer|request|ack|nak|release)\b", text):
        return "DHCP"
    if "dnsmasq" in proc or re.search(r"\b(query\[(?:a|aaaa|ptr|txt|mx|srv)\]|cached|forwarded|reply)\b", text):
        return "DNS"
    if proc == "kernel" or re.search(r"\b(wlan\d*|wifi|wireless|associated|disassociated|br-lan|eth\d+)\b", text):
        return "Kernel"
    if re.search(r"\b(drop|blocked|reject|iptables|firewall|dpt=)\b", text):
        return "Firewall"
    if proc.startswith("pppd") or re.search(r"\b(ppp|ipcp|lcp|wan ip)\b", text):
        return "PPP"
    if re.search(r"\b(resident|dhcp_opt_rule|save.?config|write.?config|dms_redirect|save_to_flash|startup)\b", proc + " " + text):
        return "System"
    return "Other"


def _infer_severity(kind: str, message: str) -> int:
    """Choose a conservative fallback severity when PRI is absent."""
    text = message.lower()
    if any(term in text for term in ("emergency", "critical", "malware", "intrusion")):
        return 2
    if kind == "Firewall" or any(term in text for term in ("failed", "denied", "reject", "drop", "timeout")):
        return 4
    if kind in {"DHCP", "DNS", "Kernel", "PPP"}:
        return 6
    return 5


def _rfc3164_timestamp(month: str, day: str, hour: str, minute: str, second: str) -> datetime:
    """Parse a yearless RFC 3164 timestamp in the configured sender timezone."""
    months = {name: index for index, name in enumerate(("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"), start=1)}
    local_zone = ZoneInfo(settings.syslog_timezone)
    current = datetime.now(local_zone)
    month_number = months[month]
    candidates = [
        datetime(year, month_number, int(day), int(hour), int(minute), int(second), tzinfo=local_zone)
        for year in (current.year - 1, current.year, current.year + 1)
    ]
    local = min(candidates, key=lambda candidate: abs((candidate - current).total_seconds()))
    return local.astimezone(timezone.utc)


def parse_generic(raw_line: str, source_device: str = "router", device_type: str = "router") -> ParsedLog:
    """Parse a syslog line into normalized fields without performing I/O."""
    raw = raw_line.strip().lstrip("\ufeff")
    if not raw:
        raise ValueError("Log line is empty")

    text = raw
    tftpd_source: str | None = None
    tftpd_timestamp: datetime | None = None
    if "|" in raw:
        columns = [part.strip() for part in raw.split("|")]
        if len(columns) >= 3:
            try:
                tftpd_timestamp = parse_datetime(columns[-1])
            except (ValueError, TypeError, OverflowError):
                tftpd_timestamp = None
            if tftpd_timestamp:
                text = columns[0]
                tftpd_source = normalize_ip(columns[1])

    pri: int | None = None
    facility: str | None = None
    timestamp: datetime | None = None
    host = "unknown"
    process = "unknown"
    pid: str | None = None
    message = text
    structured = False

    match = RFC5424.match(text)
    if match:
        structured = True
        pri = int(match.group("pri"))
        timestamp = parse_datetime(match.group("timestamp")) if match.group("timestamp") != "-" else None
        host = match.group("host") if match.group("host") != "-" else "unknown"
        process = match.group("process") if match.group("process") != "-" else "unknown"
        pid = match.group("pid") if match.group("pid") != "-" else None
        message = match.group("message") or ""
    else:
        match = RFC3164.match(text)
        if not match:
            match = RFC3164_NOHOST.match(text)
        if match:
            structured = True
            pri = int(match.group("pri")) if match.group("pri") else None
            timestamp = _rfc3164_timestamp(match.group("month"), match.group("day"), match.group("hour"), match.group("minute"), match.group("second"))
            host = match.groupdict().get("host") or "unknown"
            process = match.group("process")
            pid = match.group("pid")
            message = match.group("message")
        else:
            plain = re.match(r"^(?P<process>[A-Za-z0-9_.-]+)(?:\[(?P<pid>[^\]]+)\])?:\s*(?P<message>.*)$", text)
            if plain:
                process = plain.group("process")
                pid = plain.group("pid")
                message = plain.group("message")

    if tftpd_timestamp:
        timestamp = tftpd_timestamp
        structured = structured or bool(text)
    timestamp = timestamp or datetime.now(timezone.utc)
    if pri is not None and 0 <= pri <= 191:
        severity = pri & 7
        facility = FACILITIES[pri >> 3] if (pri >> 3) < len(FACILITIES) else f"facility-{pri >> 3}"
    else:
        severity = _infer_severity(_classify(process, message), message)

    kind = _classify(process, message)
    ips = list(dict.fromkeys(ip for match_ip in IP_PATTERN.findall(message) if (ip := normalize_ip(match_ip))))
    mac_matches = MAC_PATTERN.findall(message)
    mac = mac_matches[0].replace("-", ":").upper() if mac_matches else None
    domains = list(dict.fromkeys(domain.lower() for domain in DOMAIN_PATTERN.findall(message) if normalize_ip(domain) is None))
    source_match = re.search(r"\b(?:SRC|source|from|client)\s*[=: ]\s*(\d{1,3}(?:\.\d{1,3}){3})\b", message, re.I)
    source_ip = normalize_ip(source_match.group(1)) if source_match else normalize_ip(host)
    lease_match = re.search(r"\b(?:offered|lease|address|for|to|on|using)\s+(?:address\s+)?(\d{1,3}(?:\.\d{1,3}){3})\b", message, re.I)
    lease_ip = normalize_ip(lease_match.group(1)) if lease_match and kind == "DHCP" else None
    if kind == "DHCP" and not lease_ip:
        lease_ip = next((ip for ip in ips if is_private_ip(ip)), None)
    if kind == "DHCP" and not source_ip:
        source_ip = next((ip for ip in ips if is_private_ip(ip)), None)
    wan_match = re.search(r"\b(?:local|wan)\s+IP\s+address\s+(\d{1,3}(?:\.\d{1,3}){3})", message, re.I) if kind == "PPP" else None
    wan_ip = normalize_ip(wan_match.group(1)) if wan_match else None
    if tftpd_source:
        source_ip = tftpd_source
        if tftpd_source not in ips:
            ips.append(tftpd_source)

    host_match = re.search(r"\b(?:client\s+)?hostname\s*[:=]?\s*[\"']?([a-z0-9][a-z0-9._-]{1,127})", message, re.I)
    if not host_match:
        host_match = re.search(r"\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\s+([a-z][a-z0-9._-]{1,127})\b", message, re.I)
    client_hostname = host_match.group(1) if host_match else None
    dst_match = re.search(r"\b(?:DPT|dport|dst_port|destination_port)\s*[=:]\s*(\d{1,5})", message, re.I)
    protocol_match = re.search(r"\bPROTO\s*[=:]\s*([a-z0-9]+)", message, re.I)
    interface_match = re.search(r"\b(?:IN|OUT|interface|ifname)\s*[=: ]\s*([a-z0-9_.-]+)", message, re.I)

    return ParsedLog(
        raw=raw,
        pri=pri if pri is None or 0 <= pri <= 191 else None,
        facility=facility,
        severity=severity,
        severity_name=SEVERITY_NAMES[severity],
        severity_group=_severity_group(severity),
        timestamp=timestamp,
        host=host[:128],
        process=process[:128],
        pid=pid[:16] if pid else None,
        message=message,
        type=kind,
        source_ip=source_ip,
        mac_address=mac,
        lease_ip=lease_ip,
        wan_ip=wan_ip,
        client_hostname=client_hostname,
        domains=domains,
        ips=ips,
        dst_port=dst_match.group(1) if dst_match else None,
        protocol=protocol_match.group(1).upper() if protocol_match else None,
        structured=structured,
        source_device=(source_device or device_type or "router")[:64],
        interface_name=interface_match.group(1) if interface_match else None,
    )


def parse_syslog(raw_line: str, device_type: str = "router", source_device: str | None = None) -> ParsedLog:
    """Dispatch a log line to a device parser plugin, falling back to generic parsing."""
    normalized_type = (device_type or "router").lower()
    from services.parsers import parser_for

    plugin: Callable[..., ParsedLog] | None = parser_for(normalized_type)
    if plugin:
        return plugin(raw_line, source_device=source_device or normalized_type)
    return parse_generic(raw_line, source_device=source_device or normalized_type, device_type=normalized_type)
