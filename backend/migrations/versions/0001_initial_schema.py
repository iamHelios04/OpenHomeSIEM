# === filename: backend/migrations/versions/0001_initial_schema.py ===
"""Create the initial OpenHomeSIEM inventory, event, anomaly, and alert schema."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create base tables and indexes used by the API and ingestion workers."""
    op.create_table(
        "devices",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("mac_address", sa.String(length=17), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("hostname", sa.String(length=128), nullable=True),
        sa.Column("device_type", sa.String(length=32), nullable=False, server_default="unknown"),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_events", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="Active"),
        sa.Column("vendor", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_trusted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("tags", sa.Text(), nullable=False, server_default=sa.text("'[]'")),
    )
    op.create_index("ix_devices_mac_address", "devices", ["mac_address"], unique=True)
    op.create_index("ix_devices_ip_address", "devices", ["ip_address"])
    op.create_index("ix_devices_last_seen", "devices", ["last_seen"])

    op.create_table(
        "log_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("raw", sa.Text(), nullable=False),
        sa.Column("pri", sa.Integer(), nullable=True),
        sa.Column("facility", sa.String(length=32), nullable=True),
        sa.Column("severity", sa.Integer(), nullable=True),
        sa.Column("severity_name", sa.String(length=16), nullable=True),
        sa.Column("severity_group", sa.String(length=16), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("host", sa.String(length=128), nullable=True),
        sa.Column("process", sa.String(length=128), nullable=True),
        sa.Column("pid", sa.String(length=16), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False, server_default="Other"),
        sa.Column("source_ip", sa.String(length=45), nullable=True),
        sa.Column("mac_address", sa.String(length=17), nullable=True),
        sa.Column("lease_ip", sa.String(length=45), nullable=True),
        sa.Column("wan_ip", sa.String(length=45), nullable=True),
        sa.Column("client_hostname", sa.String(length=128), nullable=True),
        sa.Column("domains", sa.Text(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("ips", sa.Text(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("dst_port", sa.String(length=8), nullable=True),
        sa.Column("protocol", sa.String(length=16), nullable=True),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("structured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("source_device", sa.String(length=64), nullable=False, server_default="router"),
        sa.Column("switch_port", sa.String(length=32), nullable=True),
        sa.Column("vlan_id", sa.String(length=16), nullable=True),
        sa.Column("interface_name", sa.String(length=64), nullable=True),
        sa.Column("embedding", sa.LargeBinary(), nullable=True),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("ai_tags", sa.Text(), nullable=True),
    )
    for name, column in (
        ("ix_log_records_severity", "severity"),
        ("ix_log_records_severity_group", "severity_group"),
        ("ix_log_records_timestamp", "timestamp"),
        ("ix_log_records_process", "process"),
        ("ix_log_records_type", "type"),
        ("ix_log_records_source_ip", "source_ip"),
        ("ix_log_records_mac_address", "mac_address"),
        ("ix_log_records_device_id", "device_id"),
        ("ix_log_records_source_device", "source_device"),
    ):
        op.create_index(name, "log_records", [column])
    op.create_index("ix_log_records_timestamp_type", "log_records", ["timestamp", "type"])
    op.create_index("ix_log_records_source_device_timestamp", "log_records", ["source_device", "timestamp"])

    op.create_table(
        "anomalies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("rule_id", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("evidence_ids", sa.Text(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("source_ip", sa.String(length=45), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("resolved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_anomalies_rule_id", "anomalies", ["rule_id"])
    op.create_index("ix_anomalies_source_ip", "anomalies", ["source_ip"])
    op.create_index("ix_anomalies_detected_at", "anomalies", ["detected_at"])
    op.create_index("ix_anomalies_resolved", "anomalies", ["resolved"])

    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="open"),
        sa.Column("related_ids", sa.Text(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_alerts_status", "alerts", ["status"])


def downgrade() -> None:
    """Drop tables in dependency-safe order."""
    op.drop_index("ix_alerts_status", table_name="alerts")
    op.drop_table("alerts")
    op.drop_index("ix_anomalies_resolved", table_name="anomalies")
    op.drop_index("ix_anomalies_detected_at", table_name="anomalies")
    op.drop_index("ix_anomalies_source_ip", table_name="anomalies")
    op.drop_index("ix_anomalies_rule_id", table_name="anomalies")
    op.drop_table("anomalies")
    op.drop_index("ix_log_records_source_device_timestamp", table_name="log_records")
    op.drop_index("ix_log_records_timestamp_type", table_name="log_records")
    for name in (
        "ix_log_records_source_device", "ix_log_records_device_id", "ix_log_records_mac_address",
        "ix_log_records_source_ip", "ix_log_records_type", "ix_log_records_process",
        "ix_log_records_timestamp", "ix_log_records_severity_group", "ix_log_records_severity",
    ):
        op.drop_index(name, table_name="log_records")
    op.drop_table("log_records")
    op.drop_index("ix_devices_last_seen", table_name="devices")
    op.drop_index("ix_devices_ip_address", table_name="devices")
    op.drop_index("ix_devices_mac_address", table_name="devices")
    op.drop_table("devices")
