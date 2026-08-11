"""Plans, gating, and Razorpay scaffolding.

Free:  up to free_card_limit cards, free_ai_calls_per_day AI calls/day, digest on.
Pro:   unlimited, INR pro_price_inr/month via Razorpay subscription.

Razorpay calls are guarded so the app runs without keys; a /billing/checkout
returns a real order when keys are present, otherwise a mock order for dev."""
import hmac
import hashlib
from datetime import datetime, date, timedelta, timezone
from sqlmodel import select
import httpx
from .config import get_settings
from .models import User, Card, UsageDay

settings = get_settings()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def is_pro(user: User) -> bool:
    return user.plan in ("pro", "ultra") and (user.plan_until is None or user.plan_until > _now())


def is_ultra(user: User) -> bool:
    return user.plan == "ultra" and (user.plan_until is None or user.plan_until > _now())


def can_add_card(session, user: User) -> tuple[bool, str]:
    if is_pro(user):
        return True, ""
    count = len(session.exec(select(Card).where(Card.user_id == user.id)).all())
    if count >= settings.free_card_limit:
        return False, f"Free plan holds {settings.free_card_limit} cards. Upgrade to Pro for unlimited."
    return True, ""


def check_ai_quota(session, user: User) -> tuple[bool, str]:
    """Per-user daily AI rate limit (the brief's production-hardening item)."""
    if is_pro(user):
        return True, ""
    if user.id is None:
        return False, "User ID missing"
    today = date.today()
    row = session.exec(select(UsageDay).where(
        UsageDay.user_id == user.id, UsageDay.day == today)).first()
    if row is None:
        row = UsageDay(user_id=user.id, day=today, ai_calls=0)
        session.add(row)
    if row.ai_calls >= settings.free_ai_calls_per_day:
        return False, "Daily AI limit reached on the free plan. Resets tomorrow, or upgrade to Pro."
    row.ai_calls += 1
    session.add(row)
    session.commit()
    return True, ""


# --- Razorpay ---------------------------------------------------------------

def create_checkout(user: User) -> dict:
    amount_paise = settings.pro_price_inr * 100
    if not (settings.razorpay_key_id and settings.razorpay_key_secret):
        return {"mock": True, "order_id": f"mock_order_{user.id}",
                "amount": amount_paise, "currency": "INR",
                "note": "Set RAZORPAY keys to create real orders."}
    r = httpx.post("https://api.razorpay.com/v1/orders",
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
        json={"amount": amount_paise, "currency": "INR",
              "notes": {"user_id": str(user.id)}}, timeout=30)
    r.raise_for_status()
    o = r.json()
    return {"mock": False, "order_id": o["id"], "amount": amount_paise,
            "currency": "INR", "key_id": settings.razorpay_key_id}


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    if not settings.razorpay_webhook_secret:
        return True  # dev: accept
    expected = hmac.new(settings.razorpay_webhook_secret.encode(),
                        body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def activate_pro(session, user: User, months: int = 1) -> None:
    now = _now()
    base = user.plan_until if (user.plan_until and user.plan_until > now) else now
    user.plan = "pro"
    user.plan_until = base + timedelta(days=30 * months)
    session.add(user)
    session.commit()
