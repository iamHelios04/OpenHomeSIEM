# === filename: backend/config.py ===
"""Application settings loaded from environment variables."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated runtime configuration for API, storage, and listeners."""

    app_name: str = "OpenHomeSIEM"
    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./data/siem.db"
    auto_migrate: bool = True
    syslog_udp_host: str = "0.0.0.0"
    syslog_udp_port: int = 514
    syslog_tcp_host: str = "0.0.0.0"
    syslog_tcp_port: int = 601
    syslog_timezone: str = "Asia/Kolkata"
    enable_syslog_listener: bool = True
    cors_origins: str = "http://localhost,http://localhost:5173"
    log_level: str = "INFO"
    secret_key: str | None = None
    max_records_per_query: int = 10000
    max_ingest_lines: int = 10000
    max_ingest_line_length: int = 16384
    suspicious_ips: str = ""
    max_log_retention_days: int = 90
    archive_dir: str = "./data/archive"
    retention_check_hours: int = 24
    syslog_batch_size: int = 100
    syslog_batch_wait_ms: int = 250
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None

    model_config = SettingsConfigDict(env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        """Return configured browser origins as a normalized list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def archive_path(self) -> Path:
        """Return the archive location as a Path."""
        return Path(self.archive_dir).expanduser()

    @property
    def suspicious_ip_list(self) -> set[str]:
        """Return canonical comma-separated local threat indicators."""
        from utils.ip_utils import normalize_ip

        return {normalized for value in self.suspicious_ips.split(",") if (normalized := normalize_ip(value))}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings()


settings = get_settings()
