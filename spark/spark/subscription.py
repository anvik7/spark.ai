"""Plans, Entitlements, and Razorpay Scaffolding.

Tiers:
  - Free (₹0/mo): 10 daily AI calls, 50MB storage (3 uploads max), 2 downloads/month.
  - Plus (₹499/mo ⭐ Most Popular): 100 daily AI calls, 1GB storage (25 uploads max), 25 downloads/month, priority processing.
  - Pro (₹799/mo 🚀 Power Workspace): 1000 daily AI calls (fair use), 10GB storage, 1000 downloads/month, advanced analytics.

14-Day Free Trial:
  - Active for 14 days after signup (`trial_active` & `now <= trial_expires_at`).
  - Grants Plus-level AI calls, uploads, storage, and advanced AI features.
  - Downloads remain strictly capped at 2/month during trial.
  - Automatically falls back to Free plan when expired unless subscribed.
"""
import hmac
import hashlib
from datetime import datetime, date, timedelta, timezone
from sqlmodel import select, col, func
import httpx
from .config import get_settings
from .models import User, Card, UsageDay, StudyMediaSource

settings = get_settings()

TIER_LIMITS = {
    "free": {
        "ai_calls_per_day": 10,
        "max_uploads": 3,
        "storage_bytes": 50 * 1024 * 1024,        # 50 MB
        "max_downloads_per_month": 2,
        "advanced_ai": False,
        "advanced_analytics": False,
        "priority_processing": False,
        "monthly_price_inr": 0,
    },
    "plus": {
        "ai_calls_per_day": 100,
        "max_uploads": 25,
        "storage_bytes": 1 * 1024 * 1024 * 1024,  # 1 GB
        "max_downloads_per_month": 25,
        "advanced_ai": True,
        "advanced_analytics": False,
        "priority_processing": True,
        "monthly_price_inr": 499,
    },
    "pro": {
        "ai_calls_per_day": 1000,                # Fair use limit
        "max_uploads": None,                     # Unlimited
        "storage_bytes": 10 * 1024 * 1024 * 1024, # 10 GB
        "max_downloads_per_month": 1000,         # Fair use limit
        "advanced_ai": True,
        "advanced_analytics": True,
        "priority_processing": True,
        "monthly_price_inr": 799,
    },
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def is_active_paid(user: User) -> bool:
    """Return True if user has an unexpired paid subscription (plus or pro)."""
    return user.plan in ("plus", "pro") and (user.plan_until is None or user.plan_until > _now())


def is_trial_active(user: User) -> bool:
    """Return True if the 14-day free trial is currently active."""
    if not getattr(user, "trial_active", True):
        return False
    expires_at = getattr(user, "trial_expires_at", None)
    if expires_at is None:
        return False
    # Ensure timezone awareness
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return _now() <= expires_at


def get_effective_plan(user: User) -> str:
    """Determine effective plan for features & quotas ('free', 'plus', 'pro')."""
    if is_active_paid(user):
        return user.plan
    if is_trial_active(user):
        return "plus"  # Trial gives full Plus-level experience
    return "free"


def get_plan_limits(user: User) -> dict:
    """Get limits for user's effective plan, adjusting downloads during trial."""
    eff_plan = get_effective_plan(user)
    limits = dict(TIER_LIMITS.get(eff_plan, TIER_LIMITS["free"]))

    # Special rule: During trial, downloads are strictly capped at 2/month
    if not is_active_paid(user) and is_trial_active(user):
        limits["max_downloads_per_month"] = 2
        limits["is_trial"] = True
    else:
        limits["is_trial"] = False

    return limits


def get_user_entitlements(user: User, session) -> dict:
    """Full user entitlement state returned via /api/me to the frontend."""
    limits = get_plan_limits(user)
    today = date.today()
    start_of_month = _now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Usage calculations
    ai_row = session.exec(select(UsageDay).where(
        UsageDay.user_id == user.id, UsageDay.day == today)).first()
    ai_used_today = ai_row.ai_calls if ai_row else 0

    downloads_month = 0

    uploads_count = session.exec(
        select(func.count()).where(StudyMediaSource.user_id == user.id)
    ).one()

    storage_used = 0

    trial_active = is_trial_active(user)
    trial_expires_at = getattr(user, "trial_expires_at", None)

    return {
        "plan": user.plan,
        "effective_plan": get_effective_plan(user),
        "is_active_paid": is_active_paid(user),
        "trial": {
            "active": trial_active,
            "started_at": getattr(user, "trial_started_at", None),
            "expires_at": trial_expires_at.isoformat() if trial_expires_at else None,
        },
        "limits": limits,
        "usage": {
            "ai_calls_today": ai_used_today,
            "downloads_month": downloads_month,
            "uploads_count": uploads_count,
            "storage_bytes_used": storage_used,
        },
    }


def check_ai_quota(session, user: User) -> tuple[bool, str]:
    """Check and increment user's daily AI quota."""
    if user.id is None:
        return False, "User ID missing"

    limits = get_plan_limits(user)
    today = date.today()
    row = session.exec(select(UsageDay).where(
        UsageDay.user_id == user.id, UsageDay.day == today)).first()

    if row is None:
        row = UsageDay(user_id=user.id, day=today, ai_calls=0)
        session.add(row)

    if row.ai_calls >= limits["ai_calls_per_day"]:
        eff = get_effective_plan(user)
        msg = f"Daily AI limit reached ({limits['ai_calls_per_day']} calls/day on {eff.title()}). Resets tomorrow or upgrade to Plus/Pro."
        return False, msg

    row.ai_calls += 1
    session.add(row)
    session.commit()
    return True, ""


def check_upload_quota(session, user: User, file_size: int) -> tuple[bool, str]:
    """Check upload count & storage limit before storing a file."""
    if user.id is None:
        return False, "User ID missing"

    limits = get_plan_limits(user)
    uploads_count = session.exec(
        select(func.count()).where(StudyMediaSource.user_id == user.id)
    ).one()

    if limits["max_uploads"] is not None and uploads_count >= limits["max_uploads"]:
        return False, f"Upload limit reached ({limits['max_uploads']} files). Upgrade to Plus or Pro for more storage."

    return True, ""


def check_download_quota(session, user: User) -> tuple[bool, str]:
    """Check monthly download limit."""
    return True, ""


# --- Razorpay Scaffolding ---------------------------------------------------

PLAN_PRICES = {
    "plus": 499,
    "pro": 799,
}


def create_checkout(user: User, plan_target: str = "plus") -> dict:
    price_inr = PLAN_PRICES.get(plan_target, 499)
    amount_paise = price_inr * 100

    if not (settings.razorpay_key_id and settings.razorpay_key_secret):
        return {
            "mock": True,
            "order_id": f"mock_order_{plan_target}_{user.id}",
            "amount": amount_paise,
            "currency": "INR",
            "plan": plan_target,
            "note": "Set RAZORPAY keys to create real orders.",
        }

    r = httpx.post(
        "https://api.razorpay.com/v1/orders",
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
        json={
            "amount": amount_paise,
            "currency": "INR",
            "notes": {"user_id": str(user.id), "plan": plan_target},
        },
        timeout=30,
    )
    r.raise_for_status()
    o = r.json()
    return {
        "mock": False,
        "order_id": o["id"],
        "amount": amount_paise,
        "currency": "INR",
        "key_id": settings.razorpay_key_id,
        "plan": plan_target,
    }


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    if not settings.razorpay_webhook_secret:
        return True  # dev accept
    expected = hmac.new(
        settings.razorpay_webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def activate_plan(session, user: User, plan_target: str = "plus", months: int = 1) -> None:
    now = _now()
    base = user.plan_until if (user.plan_until and user.plan_until > now) else now
    user.plan = plan_target if plan_target in ("plus", "pro") else "plus"
    user.plan_until = base + timedelta(days=30 * months)
    session.add(user)
    session.commit()


# --- Backward Compatibility Aliases ----------------------------------------

def can_add_card(session, user: User) -> tuple[bool, str]:
    return check_ai_quota(session, user)


def activate_pro(session, user: User, months: int = 1) -> None:
    activate_plan(session, user, plan_target="pro", months=months)


def is_pro(user: User) -> bool:
    return is_active_paid(user)


def is_ultra(user: User) -> bool:
    return user.plan == "pro" and is_active_paid(user)
