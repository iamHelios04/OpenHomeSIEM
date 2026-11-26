# === filename: backend/database.py ===
"""Async SQLAlchemy engine, request sessions, and versioned schema migrations."""

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import event, inspect
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text

from config import settings
from models.base import Base


def _prepare_sqlite_directory(database_url: str) -> None:
    """Create a local SQLite parent folder when the URL points to a file."""
    prefix = "sqlite+aiosqlite:///"
    if database_url.startswith(prefix):
        database_path = database_url[len(prefix):]
        if database_path and database_path != ":memory:":
            Path(database_path).expanduser().parent.mkdir(parents=True, exist_ok=True)


_prepare_sqlite_directory(settings.database_url)
engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"timeout": 30} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_pragmas(dbapi_connection: object, _: object) -> None:
        """Enable foreign keys and WAL for each SQLite connection."""
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


async def get_db() -> AsyncIterator[AsyncSession]:
    """Yield a request-scoped database session."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


def _alembic_config() -> Config:
    """Load Alembic configuration with the active database URL."""
    config_path = Path(__file__).resolve().with_name("alembic.ini")
    if not config_path.is_file():
        raise RuntimeError(f"Alembic configuration is missing: {config_path}")
    alembic_config = Config(str(config_path))
    alembic_config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    return alembic_config


async def _inspect_unversioned_schema() -> tuple[bool, bool]:
    """Report whether an unversioned schema exists and matches current models."""
    def inspect_schema(connection: Connection) -> tuple[bool, bool]:
        inspector = inspect(connection)
        tables = set(inspector.get_table_names())
        if "alembic_version" in tables:
            return False, False
        model_tables = set(Base.metadata.tables)
        existing = tables & model_tables
        if not existing:
            return False, False
        if existing != model_tables:
            return True, False
        for table_name, table in Base.metadata.tables.items():
            actual_columns = {column["name"] for column in inspector.get_columns(table_name)}
            expected_columns = {column.name for column in table.columns}
            if not expected_columns.issubset(actual_columns):
                return True, False
        return True, True

    async with engine.connect() as connection:
        return await connection.run_sync(inspect_schema)


async def init_db() -> None:
    """Apply versioned migrations, or verify schema when auto-migration is disabled."""
    from models import Alert, Anomaly, Device, LogRecord  # noqa: F401

    if settings.auto_migrate:
        alembic_config = _alembic_config()
        unversioned_schema, legacy_schema_compatible = await _inspect_unversioned_schema()
        if unversioned_schema and not legacy_schema_compatible:
            raise RuntimeError(
                "An unversioned database with an incomplete OpenHomeSIEM schema was found. "
                "Back it up and create an explicit migration before enabling AUTO_MIGRATE."
            )
        if legacy_schema_compatible:
            await asyncio.to_thread(command.stamp, alembic_config, "head")
        await asyncio.to_thread(command.upgrade, alembic_config, "head")
        return
    async with engine.connect() as connection:
        try:
            await connection.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
        except Exception as exc:
            raise RuntimeError("Database schema is not initialized; run `alembic upgrade head` or enable AUTO_MIGRATE") from exc


async def close_db() -> None:
    """Dispose the async engine during application shutdown."""
    await engine.dispose()
