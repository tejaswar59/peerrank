"""Transactional email — currently just the sign-up OTP.

If SMTP is configured (settings.smtp_host), the code is emailed with a
professional Peer Rank template. If not (local dev), it's logged to the server
console so the flow stays fully testable without a mail provider.
"""
import logging
import smtplib
import socket
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parseaddr

from .config import settings

log = logging.getLogger("peerrank.mailer")


def _otp_html(code: str, minutes: int) -> str:
    app = settings.app_name
    return f"""\
<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f3;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a18;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f3;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border:1px solid #e2e0da;border-radius:16px;overflow:hidden;max-width:440px;">
          <tr><td style="padding:28px 32px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="width:34px;height:34px;background:#0f6e56;border-radius:9px;color:#fff;
                         font-weight:700;font-size:18px;text-align:center;vertical-align:middle;">P</td>
              <td style="padding-left:10px;font-weight:600;font-size:17px;">{app}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:12px 32px 4px;">
            <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:21px;margin:0 0 8px;">
              Confirm your email
            </h1>
            <p style="color:#6b6a66;font-size:14.5px;line-height:1.55;margin:0 0 22px;">
              Use the code below to finish creating your {app} account. It expires in {minutes} minutes.
            </p>
          </td></tr>
          <tr><td align="center" style="padding:0 32px;">
            <div style="display:inline-block;background:#e1f5ee;border:1px solid #b9dccd;border-radius:12px;
                        padding:16px 28px;font-family:'SF Mono',ui-monospace,monospace;
                        font-size:32px;font-weight:700;letter-spacing:8px;color:#0b5744;">{code}</div>
          </td></tr>
          <tr><td style="padding:24px 32px 30px;">
            <p style="color:#9b9a95;font-size:12.5px;line-height:1.5;margin:0;">
              If you didn't request this, you can safely ignore this email — no account is created
              until the code is entered.
            </p>
          </td></tr>
        </table>
        <p style="color:#9b9a95;font-size:12px;margin:16px 0 0;">Peer Rank · anonymous peer ranking</p>
      </td></tr>
    </table>
  </body>
</html>"""


def send_otp_email(to_email: str, code: str) -> None:
    minutes = max(1, settings.otp_ttl_seconds // 60)
    subject = f"Your {settings.app_name} verification code"
    text = (
        f"Your {settings.app_name} verification code is {code}. "
        f"It expires in {minutes} minutes. If you didn't request this, ignore this email."
    )

    if not settings.smtp_host:
        # Dev fallback: no mail provider configured — surface the code in logs.
        log.warning("[DEV] SMTP not configured — OTP for %s is %s", to_email, code)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(_otp_html(code, minutes), "html"))

    # Envelope sender must be a bare address, even if From has a display name.
    envelope_from = parseaddr(settings.smtp_from)[1] or settings.smtp_from

    # Force IPv4: some hosts (e.g. Render) have no IPv6 route, so connecting to
    # Gmail's AAAA record fails with "Network is unreachable". Resolve an IPv4
    # address and connect to it, but keep the hostname for TLS verification.
    ipv4 = socket.getaddrinfo(
        settings.smtp_host, settings.smtp_port, socket.AF_INET, socket.SOCK_STREAM
    )[0][4][0]
    try:
        with smtplib.SMTP(ipv4, settings.smtp_port, timeout=15) as s:
            s._host = settings.smtp_host  # cert is verified against the hostname, not the IP
            if settings.smtp_use_tls:
                s.starttls(context=ssl.create_default_context())
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.sendmail(envelope_from, [to_email], msg.as_string())
    except Exception:
        log.exception("Failed to send OTP email to %s", to_email)
        raise
