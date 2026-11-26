# === filename: backend/services/report_generator.py ===
"""Bounded summary and CSV/PDF report generation helpers."""

import csv
import io
import json
from xml.sax.saxutils import escape
from collections import Counter
from datetime import timedelta
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Anomaly, Device, LogRecord
from utils.time_utils import ensure_utc, utc_now


def records_to_csv(records: list[LogRecord]) -> str:
    """Serialize a bounded list of log records to a UTF-8 CSV document."""
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["id", "timestamp", "severity", "pri", "facility", "source_ip", "type", "process", "host", "mac_address", "lease_ip", "wan_ip", "domains", "message", "raw", "source_device"])
    for record in records:
        writer.writerow([
            record.id, ensure_utc(record.timestamp).isoformat(), record.severity_name, record.pri,
            record.facility, record.source_ip, record.type, record.process, record.host,
            record.mac_address, record.lease_ip, record.wan_ip, record.domains, record.message, record.raw, record.source_device,
        ])
    return output.getvalue()


async def build_summary(session: AsyncSession) -> dict[str, Any]:
    """Aggregate report metrics using bounded SQL queries."""
    total = int(await session.scalar(select(func.count(LogRecord.id)) ) or 0)
    critical = int(await session.scalar(select(func.count(LogRecord.id)).where(LogRecord.severity <= 3)) or 0)
    warning = int(await session.scalar(select(func.count(LogRecord.id)).where(LogRecord.severity == 4)) or 0)
    device_count = int(await session.scalar(select(func.count(Device.id))) or 0)
    firewall_count = int(await session.scalar(select(func.count(LogRecord.id)).where(LogRecord.type == "Firewall")) or 0)
    dns_count = int(await session.scalar(select(func.count(LogRecord.id)).where(LogRecord.type == "DNS")) or 0)
    type_rows = (await session.execute(select(LogRecord.type, func.count(LogRecord.id)).group_by(LogRecord.type))).all()
    source_rows = (await session.execute(
        select(LogRecord.source_ip, func.count(LogRecord.id))
        .where(LogRecord.source_ip.is_not(None))
        .group_by(LogRecord.source_ip)
        .order_by(func.count(LogRecord.id).desc())
        .limit(10)
    )).all()
    dns_records = (await session.scalars(
        select(LogRecord.domains).where(LogRecord.type == "DNS").order_by(LogRecord.timestamp.desc()).limit(10000)
    )).all()
    domains: Counter[str] = Counter()
    for encoded in dns_records:
        try:
            values = json.loads(encoded or "[]")
        except (TypeError, json.JSONDecodeError):
            values = []
        if isinstance(values, list):
            domains.update(str(value).lower() for value in values)
    anomaly_count = int(await session.scalar(select(func.count(Anomaly.id))) or 0)
    anomaly_rows = (await session.scalars(select(Anomaly).order_by(Anomaly.detected_at.desc()).limit(500))).all()
    since = utc_now() - timedelta(hours=24)
    hourly_records = (await session.scalars(select(LogRecord.timestamp).where(LogRecord.timestamp >= since).order_by(LogRecord.timestamp.desc()).limit(settings.max_records_per_query))).all()
    by_hour: Counter[str] = Counter()
    for timestamp in hourly_records:
        by_hour[ensure_utc(timestamp).replace(minute=0, second=0, microsecond=0).isoformat()] += 1
    return {
        "generated_at": utc_now().isoformat(),
        "total": total,
        "critical": critical,
        "warning": warning,
        "devices": device_count,
        "dns_queries": dns_count,
        "dhcp_leases": int(await session.scalar(select(func.count(LogRecord.id)).where(LogRecord.type == "DHCP", LogRecord.message.ilike("%DHCPACK%"))) or 0),
        "blocked": firewall_count,
        "anomaly_count": anomaly_count,
        "by_type": {str(kind): int(count) for kind, count in type_rows},
        "by_hour": [{"hour": hour, "count": count} for hour, count in sorted(by_hour.items())],
        "top_talkers": [{"ip": ip, "count": int(count)} for ip, count in source_rows],
        "top_domains": [{"domain": domain, "count": count} for domain, count in domains.most_common(10)],
        "anomalies": [
            {"id": row.id, "rule_id": row.rule_id, "severity": row.severity, "title": row.title,
             "description": row.description, "source_ip": row.source_ip,
             "detected_at": ensure_utc(row.detected_at).isoformat(), "resolved": row.resolved}
            for row in anomaly_rows
        ],
    }


def summary_to_pdf(summary: dict[str, Any]) -> bytes:
    """Render a printable one-page report into PDF bytes."""
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=letter, rightMargin=0.55 * inch, leftMargin=0.55 * inch, topMargin=0.5 * inch, bottomMargin=0.5 * inch)
    styles = getSampleStyleSheet()
    story: list[Any] = [Paragraph("OpenHomeSIEM · Network Security Summary", styles["Title"]), Spacer(1, 8)]
    story.append(Paragraph(f"Generated {summary.get('generated_at', '')}", styles["Normal"]))
    story.append(Spacer(1, 12))
    metrics = [["Metric", "Value"], ["Total events", summary.get("total", 0)], ["Critical events", summary.get("critical", 0)], ["Warnings", summary.get("warning", 0)], ["Devices", summary.get("devices", 0)], ["Anomalies detected", summary.get("anomaly_count", 0)], ["DNS query events", summary.get("dns_queries", 0)], ["Blocked connections", summary.get("blocked", 0)]]
    table = Table(metrics, colWidths=[3.4 * inch, 2.3 * inch], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1c2333")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5df")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([table, Spacer(1, 14), Paragraph("Top talkers", styles["Heading2"])])
    talker_rows = [["Source IP", "Events"]] + [[item["ip"], item["count"]] for item in summary.get("top_talkers", [])]
    story.append(Table(talker_rows, colWidths=[3.4 * inch, 2.3 * inch], repeatRows=1))
    story.extend([Spacer(1, 12), Paragraph("Top queried domains", styles["Heading2"])])
    domain_rows = [["Domain", "Queries"]] + [[item["domain"], item["count"]] for item in summary.get("top_domains", [])]
    story.append(Table(domain_rows, colWidths=[3.4 * inch, 2.3 * inch], repeatRows=1))
    story.extend([Spacer(1, 12), Paragraph("Event timeline · hourly volume over the last day", styles["Heading2"])])
    hours = summary.get("by_hour", [])[-24:]
    if hours:
        drawing = Drawing(7.2 * inch, 1.75 * inch)
        chart = VerticalBarChart()
        chart.x = 38
        chart.y = 26
        chart.width = 7.2 * inch - 52
        chart.height = 1.35 * inch
        chart.data = [[int(item.get("count", 0)) for item in hours]]
        chart.categoryAxis.categoryNames = [str(item.get("hour", ""))[11:16] for item in hours]
        chart.categoryAxis.labels.fontSize = 6
        chart.categoryAxis.labels.angle = 35
        chart.valueAxis.valueMin = 0
        chart.valueAxis.valueMax = max(1, max(chart.data[0]))
        chart.valueAxis.valueStep = max(1, chart.valueAxis.valueMax // 4)
        chart.valueAxis.labels.fontSize = 6
        chart.bars[0].fillColor = colors.HexColor("#2f81f7")
        chart.categoryAxis.strokeColor = colors.HexColor("#8b949e")
        chart.valueAxis.strokeColor = colors.HexColor("#8b949e")
        drawing.add(chart)
        story.append(drawing)
    story.extend([Spacer(1, 12), Paragraph("Detected anomalies", styles["Heading2"])])
    for anomaly in summary.get("anomalies", [])[:15]:
        story.append(Paragraph(f"<b>{escape(str(anomaly['severity']).upper())} · {escape(str(anomaly['title']))}</b> — {escape(str(anomaly['description']))}", styles["BodyText"]))
    doc.build(story)
    return output.getvalue()
