"""Optional SMTP for transactional email (school excuse notes)."""

from __future__ import annotations

import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def smtp_configured() -> bool:
    return bool((os.getenv("SMTP_HOST") or "").strip())


def send_email_with_attachment(
    *,
    to_email: str,
    subject: str,
    body_text: str,
    attachment_bytes: bytes,
    attachment_filename: str,
) -> None:
    host = (os.getenv("SMTP_HOST") or "").strip()
    if not host:
        raise RuntimeError("SMTP не е конфигуриран на сървъра (SMTP_HOST).")
    port = int(os.getenv("SMTP_PORT") or "587")
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    from_addr = (os.getenv("SMTP_FROM") or user or "noreply@volley-platform.local").strip()

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(body_text, "plain", "utf-8"))

    part = MIMEApplication(attachment_bytes, Name=attachment_filename)
    part["Content-Disposition"] = f'attachment; filename="{attachment_filename}"'
    msg.attach(part)

    with smtplib.SMTP(host, port, timeout=30) as server:
        if os.getenv("SMTP_TLS", "true").lower() not in ("0", "false", "no"):
            server.starttls()
        if user and password:
            server.login(user, password)
        server.sendmail(from_addr, [to_email], msg.as_string())
