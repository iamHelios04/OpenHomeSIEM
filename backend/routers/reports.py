# === filename: backend/routers/reports.py ===
"""Summary JSON and printable PDF report API."""

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.report_generator import build_summary, summary_to_pdf

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary")
async def summary(session: AsyncSession = Depends(get_db)) -> dict[str, object]:
    """Return bounded summary data for the report page."""
    return await build_summary(session)


@router.get("/summary.pdf")
async def summary_pdf(session: AsyncSession = Depends(get_db)) -> Response:
    """Generate a PDF copy of the current summary report."""
    payload = summary_to_pdf(await build_summary(session))
    return Response(content=payload, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=openhome-siem-summary.pdf"})
