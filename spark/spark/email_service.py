"""Production transactional email service.

Sends password reset emails via standard SMTP when configured.
Falls back safely to local logging in development without crashing or exposing tokens.
"""
import logging
import smtplib
from email.message import EmailMessage
from .config import get_settings

logger = logging.getLogger("spark.email")


def is_smtp_configured() -> bool:
    settings = get_settings()
    return bool(settings.smtp_host and settings.smtp_port)


def send_password_reset_email(to_email: str, reset_link: str) -> bool:
    """Send a password reset email to the recipient.
    
    Returns True if sent via SMTP, or False if SMTP is unconfigured or failed.
    Never raises an uncaught exception to avoid crashing request handlers.
    """
    settings = get_settings()
    
    if not is_smtp_configured():
        # Mask email for privacy in logs
        parts = to_email.split("@")
        masked_user = parts[0][:2] + "***" if len(parts[0]) > 2 else "***"
        domain = parts[1] if len(parts) > 1 else "unknown"
        logger.info(
            f"[email_service] SMTP not configured. Password reset link ready for {masked_user}@{domain}. "
            "Configure SMTP_HOST and SMTP_PORT in production."
        )
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = "Reset Your SparkDhi Password"
        msg["From"] = settings.smtp_from_email or "noreply@sparkdhi.ai"
        msg["To"] = to_email

        plain_content = f"""Hello,

We received a request to reset your SparkDhi password.

Click or copy the link below into your browser to choose a new password:
{reset_link}

This link is valid for 30 minutes and can only be used once.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

Best regards,
The SparkDhi Team
"""
        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 24px; color: #0d1117; }}
    .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }}
    .logo {{ font-size: 20px; font-weight: 800; color: #0d1117; margin-bottom: 24px; display: inline-block; }}
    .btn {{ display: inline-block; background: #f59e0b; color: #ffffff !important; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 20px 0; }}
    .footer {{ font-size: 12px; color: #6b7280; margin-top: 28px; border-top: 1px solid #e5e7eb; padding-top: 16px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">⚡ SparkDhi</div>
    <h2 style="margin-top: 0; font-size: 18px;">Reset Your Password</h2>
    <p>We received a request to reset your SparkDhi workspace password.</p>
    <p>Click the button below to set a new password:</p>
    <div>
      <a href="{reset_link}" class="btn" target="_blank">Reset Password</a>
    </div>
    <p style="font-size: 13px; color: #57606a;">Or copy and paste this link into your browser:<br><span style="color: #f59e0b; word-break: break-all;">{reset_link}</span></p>
    <p style="font-size: 12px; color: #6b7280;">This link will expire in 30 minutes and can only be used once.</p>
    <div class="footer">
      If you did not request a password reset, you can safely ignore this message. Your account remains secure.
    </div>
  </div>
</body>
</html>
"""
        msg.set_content(plain_content)
        msg.add_alternative(html_content, subtype="html")

        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                if settings.smtp_user and settings.smtp_password:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
                server.starttls()
                if settings.smtp_user and settings.smtp_password:
                    server.login(settings.smtp_user, settings.smtp_password)
                server.send_message(msg)
        return True
    except Exception as e:
        logger.error(f"[email_service] Error delivering password reset email: {type(e).__name__}")
        return False
