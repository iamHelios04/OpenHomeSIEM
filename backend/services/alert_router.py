# === filename: backend/services/alert_router.py ===
"""Optional alert destinations with explicit configuration and bounded timeouts."""

import logging
import smtplib
import asyncio
from email.message import EmailMessage
from typing import Any

import httpx

from config import settings

logger = logging.getLogger(__name__)


async def send_email(alert: dict[str, Any], recipient: str | None = None) -> bool:
    """Send an alert email when SMTP and a recipient are configured."""
    if not all((settings.smtp_host, settings.smtp_from, recipient)):
        logger.info("Email routing is disabled because SMTP settings or recipient are missing")
        return False
    def deliver() -> bool:
        message = EmailMessage()
        message["Subject"] = f"OpenHomeSIEM: {alert.get('title', 'Security alert')}"
        message["From"] = settings.smtp_from or ""
        message["To"] = recipient or ""
        message.set_content(str(alert.get("body") or alert.get("description") or ""))
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                smtp.starttls()
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password or "")
                smtp.send_message(message)
            return True
        except (OSError, smtplib.SMTPException):
            logger.exception("Email delivery failed")
            return False

    return await asyncio.to_thread(deliver)


async def send_webhook(alert: dict[str, Any], url: str) -> None:
    """POST an alert JSON payload to an explicitly provided HTTPS webhook."""
    if not url.lower().startswith("https://"):
        raise ValueError("Webhook URLs must use HTTPS")
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.post(url, json={"source": "OpenHomeSIEM", "alert": alert})
        response.raise_for_status()


async def send_slack(alert: dict[str, Any], webhook: str) -> None:
    """Send a concise Slack-compatible webhook message."""
    title = str(alert.get("title") or "Security alert")
    body = str(alert.get("body") or alert.get("description") or "")
    await send_webhook({"text": f"*OpenHomeSIEM · {title}*\n{body}"}, webhook)
