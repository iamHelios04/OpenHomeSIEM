# === filename: backend/routers/ingest.py ===
"""HTTP log ingestion endpoint."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from schemas import IngestRequest, IngestResponse
from services.ingestion_service import ingest_raw_lines
from services.websocket_manager import websocket_manager

router = APIRouter(prefix="/ingest", tags=["ingest"])


@router.post("", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_logs(payload: IngestRequest, session: AsyncSession = Depends(get_db)) -> IngestResponse:
    """Parse, persist, track, detect, and stream a bounded batch of log lines."""
    if len(payload.lines) > settings.max_ingest_lines:
        raise HTTPException(status_code=413, detail=f"At most {settings.max_ingest_lines} lines may be sent per request")
    if any(len(line) > settings.max_ingest_line_length for line in payload.lines):
        raise HTTPException(status_code=413, detail=f"Each line is limited to {settings.max_ingest_line_length} characters")
    result = await ingest_raw_lines(session, payload.lines, payload.source_device, payload.device_type, websocket_manager)
    return IngestResponse(
        parsed=int(result["parsed"]),
        errors=int(result["errors"]),
        anomalies_found=int(result["anomalies_found"]),
        devices_discovered=int(result["devices_discovered"]),
        analysis_queued=bool(result["analysis_queued"]),
    )
