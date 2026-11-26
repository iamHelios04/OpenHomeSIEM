# === filename: backend/services/anomaly_engine.py ===
"""Composable local anomaly rules and database-backed detection deduplication."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Anomaly, Device, LogRecord
from services.threat_intel import is_suspicious_domain, is_suspicious_ip
from utils.ip_utils import is_internal_ip
from utils.time_utils import ensure_utc, utc_now


@dataclass(slots=True)
class RuleMatch:
    """A normalized, not-yet-persisted anomaly rule result."""

    rule_id: str
    severity: str
    title: str
    description: str
    evidence_log_ids: list[int]
    source_ip: str | None
    timestamp: datetime


def _parse_json_list(value: str | None) -> list[str]:
    """Safely decode JSON list columns from ORM records."""
    try:
        decoded = json.loads(value or "[]")
        return [str(item) for item in decoded] if isinstance(decoded, list) else []
    except (TypeError, json.JSONDecodeError):
        return []


def _record_datetime(record: LogRecord) -> datetime:
    """Return a record timestamp as UTC-aware."""
    return ensure_utc(record.timestamp)


def evaluate_rules(records: list[LogRecord], newly_discovered_macs: set[str] | None = None) -> list[RuleMatch]:
    """Evaluate all current local heuristics against a bounded event window."""
    if not records:
        return []
    newly_discovered_macs = newly_discovered_macs or set()
    ordered = sorted(records, key=_record_datetime)
    end = _record_datetime(ordered[-1])
    start = end - timedelta(minutes=5)
    recent = [record for record in ordered if start <= _record_datetime(record) <= end]
    matches: list[RuleMatch] = []

    indicator_hits: dict[str, list[LogRecord]] = defaultdict(list)
    for row in recent:
        if row.source_ip and is_suspicious_ip(row.source_ip):
            indicator_hits[row.source_ip].append(row)
    for address, rows in indicator_hits.items():
        matches.append(RuleMatch("THREAT_INTEL_IP", "critical", "Local IP indicator match", f"Events matched the local threat-intelligence entry {address}.", [row.id for row in rows[-20:]], address, _record_datetime(rows[-1])))

    firewall_by_ip: dict[str, list[LogRecord]] = defaultdict(list)
    firewall_rows = [row for row in recent if row.type == "Firewall" and re.search(r"drop|block|reject", row.message, re.I)]
    for row in firewall_rows:
        if row.source_ip and not is_internal_ip(row.source_ip):
            firewall_by_ip[row.source_ip].append(row)
    for source_ip, rows in firewall_by_ip.items():
        ports = {row.dst_port for row in rows if row.dst_port}
        if len(rows) > 8:
            matches.append(RuleMatch("PORT_SCAN", "critical", "Possible port scan", f"{source_ip} caused {len(rows)} firewall drops in five minutes across {len(ports) or 'multiple'} destination ports.", [row.id for row in rows[-25:]], source_ip, _record_datetime(rows[-1])))

    suspicious: dict[tuple[str, str], list[LogRecord]] = defaultdict(list)
    for row in recent:
        if row.type != "DNS" or not re.search(r"query\[", row.message, re.I):
            continue
        for domain in _parse_json_list(row.domains):
            if is_suspicious_domain(domain):
                suspicious[(domain, row.source_ip or "")].append(row)
    for (domain, source_ip), rows in suspicious.items():
        matches.append(RuleMatch("DNS_SUSPICIOUS", "high", f"Unusual DNS domain: {domain}", f"A client queried {domain}, which uses a locally watched TLD.", [row.id for row in rows[-20:]], source_ip or None, _record_datetime(rows[-1])))

    dhcp_by_mac: dict[str, list[LogRecord]] = defaultdict(list)
    for row in recent:
        if row.type == "DHCP" and row.mac_address and re.search(r"DHCP(?:DISCOVER|REQUEST)", row.message, re.I):
            dhcp_by_mac[row.mac_address.upper()].append(row)
    for mac, rows in dhcp_by_mac.items():
        if len(rows) > 4:
            matches.append(RuleMatch("DHCP_STORM", "high", "Repeated DHCP requests", f"{mac} sent {len(rows)} discover/request messages in five minutes.", [row.id for row in rows[-20:]], rows[-1].source_ip, _record_datetime(rows[-1])))

    seen_new_devices: set[str] = set()
    for row in recent:
        mac = row.mac_address.upper() if row.mac_address else ""
        if mac and mac in newly_discovered_macs and mac not in seen_new_devices:
            seen_new_devices.add(mac)
            identity = row.client_hostname or mac
            detail = f"received a lease at {row.lease_ip}" if row.lease_ip else "appeared in router telemetry"
            matches.append(RuleMatch("NEW_DEVICE", "medium", f"New device observed: {identity}", f"{identity} {detail} and is not trusted.", [row.id], row.lease_ip or row.source_ip, _record_datetime(row)))

    ppp_rows = [row for row in recent if row.type == "PPP" and re.search(r"connect:|connected|ipcp.*up|link is up", row.message, re.I)]
    if len(ppp_rows) > 3:
        matches.append(RuleMatch("PPP_LOOP", "high", "WAN reconnection loop", f"The PPP link reported {len(ppp_rows)} reconnect events in five minutes.", [row.id for row in ppp_rows[-20:]], None, _record_datetime(ppp_rows[-1])))

    if len(firewall_rows) > 15:
        matches.append(RuleMatch("FIREWALL_SURGE", "high", "Firewall drop surge", f"{len(firewall_rows)} blocked or rejected connections were logged in five minutes.", [row.id for row in firewall_rows[-25:]], None, _record_datetime(firewall_rows[-1])))

    for row in recent:
        if row.type != "DNS" or not re.search(r"query\[", row.message, re.I):
            continue
        for domain in _parse_json_list(row.domains):
            if len(domain) > 50:
                matches.append(RuleMatch("DNS_EXFIL", "high", "Unusually long DNS name", f"A DNS query contained a {len(domain)}-character domain name.", [row.id], row.source_ip, _record_datetime(row)))

    auth_failures: dict[str, list[LogRecord]] = defaultdict(list)
    for row in recent:
        if row.source_ip and re.search(r"failed password|authentication failure|login failed|invalid user", row.message, re.I):
            auth_failures[row.source_ip].append(row)
    for source_ip, rows in auth_failures.items():
        if len(rows) >= 5:
            matches.append(RuleMatch("BRUTE_FORCE", "critical", "Repeated authentication failures", f"{len(rows)} authentication failures were recorded from {source_ip} in five minutes.", [row.id for row in rows[-25:]], source_ip, _record_datetime(rows[-1])))

    lateral: dict[str, set[str]] = defaultdict(set)
    lateral_rows: dict[str, list[LogRecord]] = defaultdict(list)
    for row in recent:
        if row.type != "Firewall" or not row.source_ip or not is_internal_ip(row.source_ip):
            continue
        destination = re.search(r"\bDST\s*[=:]\s*(\d{1,3}(?:\.\d{1,3}){3})", row.message, re.I)
        if destination and is_internal_ip(destination.group(1)) and destination.group(1) != row.source_ip:
            lateral[row.source_ip].add(destination.group(1))
            lateral_rows[row.source_ip].append(row)
    for source_ip, destinations in lateral.items():
        if len(destinations) >= 5:
            rows = lateral_rows[source_ip]
            matches.append(RuleMatch("LATERAL_MOVE", "high", "Internal network scanning", f"{source_ip} contacted {len(destinations)} internal destinations in five minutes.", [row.id for row in rows[-25:]], source_ip, _record_datetime(rows[-1])))

    return matches


async def detect_and_store(
    session: AsyncSession,
    records: list[LogRecord],
    newly_discovered_macs: set[str] | None = None,
) -> list[Anomaly]:
    """Evaluate a batch, persist non-duplicate anomalies, and return new rows."""
    matches = evaluate_rules(records, newly_discovered_macs)
    stored: list[Anomaly] = []
    cutoff = utc_now() - timedelta(minutes=15)
    for match in matches:
        duplicate = await session.scalar(
            select(Anomaly.id).where(
                Anomaly.rule_id == match.rule_id,
                Anomaly.title == match.title,
                Anomaly.resolved.is_(False),
                Anomaly.detected_at >= cutoff,
            ).limit(1)
        )
        if duplicate:
            continue
        anomaly = Anomaly(
            rule_id=match.rule_id,
            severity=match.severity,
            title=match.title,
            description=match.description,
            evidence_ids=json.dumps(match.evidence_log_ids),
            source_ip=match.source_ip,
            detected_at=match.timestamp,
            resolved=False,
        )
        session.add(anomaly)
        stored.append(anomaly)
    await session.flush()
    return stored
