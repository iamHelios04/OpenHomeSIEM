# === filename: backend/main.py ===
"""FastAPI application entry point and service lifecycle."""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from config import settings
from database import SessionLocal, close_db, engine, init_db
from routers import alerts, anomalies, devices, ingest, logs, reports, stats, ws
from services.retention_service import retention_worker
from services.anomaly_worker import anomaly_queue
from services.syslog_server import SyslogRuntime, start_syslog_servers
from services.websocket_manager import websocket_manager

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("openhome_siem")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Initialize storage, listeners, and retention before accepting traffic."""
    await init_db()
    runtime: SyslogRuntime | None = None
    retention_task: asyncio.Task[None] | None = None
    anomaly_task: asyncio.Task[None] | None = asyncio.create_task(anomaly_queue.run(SessionLocal, websocket_manager), name="anomaly-worker")
    if settings.enable_syslog_listener:
        runtime = await start_syslog_servers(SessionLocal, websocket_manager)
        app.state.syslog_status = {"udp": runtime.udp_started, "tcp": runtime.tcp_started}
    else:
        logger.info("Syslog listeners are disabled by configuration")
        app.state.syslog_status = {"udp": False, "tcp": False}
    retention_task = asyncio.create_task(retention_worker(SessionLocal), name="retention-worker")
    try:
        yield
    finally:
        try:
            await asyncio.wait_for(anomaly_queue.join(), timeout=10)
        except TimeoutError:
            logger.warning("Stopping with pending anomaly batches after the drain timeout")
        if retention_task:
            retention_task.cancel()
            await asyncio.gather(retention_task, return_exceptions=True)
        if anomaly_task:
            anomaly_task.cancel()
            await asyncio.gather(anomaly_task, return_exceptions=True)
        if runtime:
            await runtime.close()
        await close_db()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Self-hosted, local-first syslog collection and investigation API.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

for api_router in (logs.router, ingest.router, stats.router, devices.router, anomalies.router, alerts.router, reports.router):
    app.include_router(api_router, prefix="/api")
app.include_router(ws.router)


@app.get("/api/health", tags=["health"])
async def health(request: Request) -> dict[str, object]:
    """Check database connectivity and return listener availability."""
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        database = "ok"
    except Exception as exc:
        logger.exception("Health check failed against the database")
        return {"status": "degraded", "database": "error", "detail": str(exc)[:160], "websocket_clients": websocket_manager.connection_count}
    listeners = getattr(request.app.state, "syslog_status", {"udp": False, "tcp": False})
    return {
        "status": "ok",
        "database": database,
        "syslog_enabled": settings.enable_syslog_listener,
        "syslog_listeners": listeners,
        "anomaly_batches_pending": anomaly_queue.pending,
        "websocket_clients": websocket_manager.connection_count,
    }


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    """Provide a simple service identity document."""
    return {"service": settings.app_name, "docs": "/docs", "health": "/api/health"}
