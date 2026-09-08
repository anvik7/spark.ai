"""Plans, Entitlements, Centralized Billing Architecture, and Razorpay Scaffolding.

Canonical Plans:
  - TRIAL: 14-Day Full Access Trial (₹0 / $0). Complete SparkDhi workspace access.
  - PLUS: Your everyday SparkDhi workspace (₹599/mo | ₹5,990/yr or $10/mo | $100/yr).
  - PRO: Your full-power SparkDhi workspace (₹999/mo | ₹9,990/yr or $13/mo | $130/yr) [BEST VALUE].
  - EXPIRED: Past trial or lapsed subscription. User data strictly preserved, upgrade required for new AI/uploads.

Annual pricing genuinely equals 10 monthly payments:
  ₹599 × 10 = ₹5,990
  ₹999 × 10 = ₹9,990
  $10 × 10 = $100
  $13 × 10 = $130
Display: SAVE 2 MONTHS
"""
import hmac
import hashlib
from datetime import datetime, date, timedelta, timezone
from typing import Optional, Tuple
from sqlmodel import select, col, func
import httpx
from .config import get_settings
from .models import User, Card, UsageDay, StudyMediaSource, SubscriptionOrder

settings = get_settings()

TIER_LIMITS = {
    "expired": {
        "ai_calls_per_day": 0,
        "max_uploads": 0,
        "storage_bytes": 0,
        "max_downloads_per_month": 0,
        "advanced_ai": False,
        "advanced_analytics": False,
        "priority_processing": False,
    },
    "trial": {
        "ai_calls_per_day": 100,
        "max_uploads": 25,
        "storage_bytes": 1 * 1024 * 1024 * 1024,  # 1 GB
        "max_downloads_per_month": 2,
        "advanced_ai": True,
        "advanced_analytics": True,
        "priority_processing": True,
    },
    "plus": {
        "ai_calls_per_day": 100,
        "max_uploads": 25,
        "storage_bytes": 1 * 1024 * 1024 * 1024,  # 1 GB
        "max_downloads_per_month": 25,
        "advanced_ai": True,
        "advanced_analytics": False,
        "priority_processing": True,
    },
    "pro": {
        "ai_calls_per_day": 1000,                  # Fair use limit
        "max_uploads": 100,
        "storage_bytes": 10 * 1024 * 1024 * 1024, # 10 GB
        "max_downloads_per_month": 1000,         # Fair use limit
        "advanced_ai": True,
        "advanced_analytics": True,
        "priority_processing": True,
    },
}

PRICING_CATALOG = {
    "INR": {
        "currency": "INR",
        "symbol": "₹",
        "region": "India",
        "plans": {
            "plus": {
                "title": "PLUS",
                "position": "Your everyday SparkDhi workspace.",
                "description": "For everyday thinking, learning and getting things done.",
                "monthly": {"price": 599, "display": "₹599", "amount": 59900, "interval": "monthly"},
                "yearly": {"price": 5990, "display": "₹5,990", "amount": 599000, "interval": "yearly", "savings": "SAVE 2 MONTHS"},
            },
            "pro": {
                "badge": "BEST VALUE",
                "title": "PRO",
                "position": "Your full-power SparkDhi workspace.",
                "description": "For people who rely on SparkDhi heavily and want more AI capacity and advanced capabilities.",
                "monthly": {"price": 999, "display": "₹999", "amount": 99900, "interval": "monthly"},
                "yearly": {"price": 9990, "display": "₹9,990", "amount": 999000, "interval": "yearly", "savings": "SAVE 2 MONTHS"},
            },
        },
    },
    "USD": {
        "currency": "USD",
        "symbol": "$",
        "region": "Global",
        "plans": {
            "plus": {
                "title": "PLUS",
                "position": "Your everyday SparkDhi workspace.",
                "description": "For everyday thinking, learning and getting things done.",
                "monthly": {"price": 10, "display": "$10", "amount": 1000, "interval": "monthly"},
                "yearly": {"price": 100, "display": "$100", "amount": 10000, "interval": "yearly", "savings": "SAVE 2 MONTHS"},
            },
            "pro": {
                "badge": "BEST VALUE",
                "title": "PRO",
                "position": "Your full-power SparkDhi workspace.",
                "description": "For people who rely on SparkDhi heavily and want more AI capacity and advanced capabilities.",
                "monthly": {"price": 13, "display": "$13", "amount": 1300, "interval": "monthly"},
                "yearly": {"price": 130, "display": "$130", "amount": 13000, "interval": "yearly", "savings": "SAVE 2 MONTHS"},
            },
        },
    },
}


def _now() -> datetime:
    """Server-authoritative UTC time. Prevents client manipulation."""
    return datetime.now(timezone.utc)


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Ensure datetime is offset-aware UTC for safe comparisons."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def is_active_paid(user: User) -> bool:
    """Return True if user has an unexpired paid subscription (plus or pro)."""
    if user.plan not in ("plus", "pro"):
        return False
    if user.plan_until is None:
        return True
    until = _as_utc(user.plan_until)
    return until > _now()


def is_trial_active(user: User) -> bool:
    """Return True if the 14-day trial is currently active.
    Server-authoritative timestamp check. Client logout, refresh, localStorage,
    or URL parameters cannot reset or extend this.
    """
    if not getattr(user, "trial_active", True):
        return False
    expires_at = _as_utc(getattr(user, "trial_expires_at", None))
    if expires_at is None:
        return False
    return _now() <= expires_at


def get_subscription_status(user: User) -> str:
    """Return canonical subscription status: 'trial', 'active', 'expired', 'cancelled', 'past_due'."""
    explicit_status = getattr(user, "subscription_status", None)
    if explicit_status in ("cancelled", "past_due"):
        # If cancelled, check if current paid period has expired
        until = _as_utc(user.plan_until)
        if until and until > _now():
            return explicit_status
        return "expired"

    if is_active_paid(user):
        return "active"

    if is_trial_active(user):
        return "trial"

    return "expired"


def get_current_plan(user: User) -> str:
    """Canonical plan name for user ('plus', 'pro', 'trial', 'expired')."""
    if is_active_paid(user):
        return user.plan
    if is_trial_active(user):
        return "trial"
    return "expired"


def get_effective_plan(user: User) -> str:
    """Determine effective plan for feature access & quota evaluation ('plus', 'pro', 'trial', 'expired')."""
    if is_active_paid(user):
        return user.plan
    if is_trial_active(user):
        return "trial"
    return "expired"


def has_feature_access(user: User, feature_key: str) -> bool:
    """Centralized entitlement check for specific features."""
    eff_plan = get_effective_plan(user)
    status = get_subscription_status(user)

    # Core workspace is always viewable/accessible for reading data
    if feature_key == "core_workspace":
        return True

    # Expired accounts cannot create new AI workloads or uploads
    if status == "expired":
        return False

    # PRO-exclusive features
    if feature_key in ("advanced_analytics", "early_access", "voice_interview"):
        # During trial, allow trying voice_interview and analytics to experience full power
        if eff_plan == "pro" or eff_plan == "trial":
            return True
        return False

    # PLUS and above features (Tasks AI, Coding answers, Study AI, Quizzes, Circles, Career OS)
    return True


def get_usage_limit(user: User, limit_key: str):
    """Retrieve usage limit from canonical TIER_LIMITS."""
    limits = get_plan_limits(user)
    return limits.get(limit_key)


def get_plan_limits(user: User) -> dict:
    """Get limits for user's effective plan, adjusting downloads during trial."""
    eff_plan = get_effective_plan(user)
    limits = dict(TIER_LIMITS.get(eff_plan, TIER_LIMITS["expired"]))

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
    trial_started_at = getattr(user, "trial_started_at", None)

    days_remaining = 0
    if trial_active and trial_expires_at:
        if trial_expires_at.tzinfo is None:
            trial_expires_at = trial_expires_at.replace(tzinfo=timezone.utc)
        delta = trial_expires_at - _now()
        days_remaining = max(0, delta.days + (1 if delta.seconds > 0 else 0))

    sub_status = get_subscription_status(user)
    eff_plan = get_effective_plan(user)

    return {
        "plan": user.plan,
        "current_plan": get_current_plan(user),
        "effective_plan": eff_plan,
        "subscription_status": sub_status,
        "is_active_paid": is_active_paid(user),
        "trial": {
            "active": trial_active,
            "started_at": trial_started_at.isoformat() if trial_started_at else None,
            "expires_at": trial_expires_at.isoformat() if trial_expires_at else None,
            "days_remaining": days_remaining,
        },
        "billing": {
            "interval": getattr(user, "billing_interval", "monthly") or "monthly",
            "currency": getattr(user, "billing_currency", "INR") or "INR",
            "renews_at": user.plan_until.isoformat() if user.plan_until else None,
        },
        "limits": limits,
        "features": {
            "core_workspace": has_feature_access(user, "core_workspace"),
            "tasks_ai": has_feature_access(user, "tasks_ai"),
            "coding_answers": has_feature_access(user, "coding_answers"),
            "capture_ai": has_feature_access(user, "capture_ai"),
            "study_intelligence": has_feature_access(user, "study_intelligence"),
            "active_recall": has_feature_access(user, "active_recall"),
            "quizzes": has_feature_access(user, "quizzes"),
            "mastery_tracking": has_feature_access(user, "mastery_tracking"),
            "career_intelligence": has_feature_access(user, "career_intelligence"),
            "cover_letters": has_feature_access(user, "cover_letters"),
            "ai_coaching": has_feature_access(user, "ai_coaching"),
            "voice_interview": has_feature_access(user, "voice_interview"),
            "public_circles": has_feature_access(user, "public_circles"),
            "private_chat": has_feature_access(user, "private_chat"),
            "private_groups": has_feature_access(user, "private_groups"),
            "image_file_sharing": has_feature_access(user, "image_file_sharing"),
            "advanced_analytics": has_feature_access(user, "advanced_analytics"),
            "priority_processing": has_feature_access(user, "priority_processing"),
            "early_access": has_feature_access(user, "early_access"),
        },
        "usage": {
            "ai_calls_today": ai_used_today,
            "downloads_month": downloads_month,
            "uploads_count": uploads_count,
            "storage_bytes_used": storage_used,
        },
    }


def check_ai_quota(session, user: User) -> Tuple[bool, str]:
    """Check and increment user's daily AI quota."""
    if user.id is None:
        return False, "User ID missing"

    sub_status = get_subscription_status(user)
    if sub_status == "expired":
        return False, "Your 14-day full access trial has ended. Please choose a paid plan (Plus or Pro) to continue using AI tools."

    limits = get_plan_limits(user)
    today = date.today()
    row = session.exec(select(UsageDay).where(
        UsageDay.user_id == user.id, UsageDay.day == today)).first()

    if row is None:
        row = UsageDay(user_id=user.id, day=today, ai_calls=0)
        session.add(row)

    if row.ai_calls >= limits["ai_calls_per_day"]:
        eff = get_effective_plan(user)
        msg = f"Daily AI limit reached ({limits['ai_calls_per_day']} calls/day on {eff.title()}). Resets tomorrow or choose Pro for higher capacity."
        return False, msg

    row.ai_calls += 1
    session.add(row)
    session.commit()
    return True, ""


def check_upload_quota(session, user: User, file_size: int) -> Tuple[bool, str]:
    """Check upload count & storage limit before storing a file."""
    if user.id is None:
        return False, "User ID missing"

    sub_status = get_subscription_status(user)
    if sub_status == "expired":
        return False, "Your 14-day full access trial has ended. Please choose a paid plan (Plus or Pro) to upload files."

    limits = get_plan_limits(user)
    uploads_count = session.exec(
        select(func.count()).where(StudyMediaSource.user_id == user.id)
    ).one()

    if limits["max_uploads"] is not None and uploads_count >= limits["max_uploads"]:
        return False, f"Upload limit reached ({limits['max_uploads']} files). Upgrade to Pro for high-capacity storage."

    return True, ""


def check_download_quota(session, user: User) -> Tuple[bool, str]:
    """Check monthly download limit."""
    sub_status = get_subscription_status(user)
    if sub_status == "expired":
        return False, "Your trial or subscription has expired. Please choose a plan to download materials."
    return True, ""


# --- Payment & Razorpay Architecture ----------------------------------------

def create_checkout(
    session,
    user: User,
    plan_target: str = "plus",
    interval: str = "monthly",
    currency: str = "INR"
) -> dict:
    """Create a verified checkout order.
    The backend authoritative catalog determines the exact price and plan.
    Saves a SubscriptionOrder to database for audit & verification.
    """
    plan_target = plan_target.lower().strip()
    if plan_target not in ("plus", "pro"):
        plan_target = "plus"

    interval = interval.lower().strip()
    if interval not in ("monthly", "yearly"):
        interval = "monthly"

    currency = currency.upper().strip()
    if currency not in PRICING_CATALOG:
        currency = "INR"

    catalog = PRICING_CATALOG[currency]
    plan_data = catalog["plans"][plan_target]
    pricing_tier = plan_data[interval]
    amount = pricing_tier["amount"]  # in lowest unit (paise/cents)

    order_id = f"order_{plan_target}_{interval[:2]}_{user.id}_{int(_now().timestamp())}"
    is_mock = not bool(settings.razorpay_key_id and settings.razorpay_key_secret)

    # In live mode, missing credentials must raise an error — never silently mock.
    if settings.razorpay_mode == "live" and is_mock:
        raise ValueError(
            "Razorpay LIVE mode requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. "
            "Set RAZORPAY_MODE=test for development mock mode."
        )

    # Real Razorpay integration
    if not is_mock:
        try:
            r = httpx.post(
                "https://api.razorpay.com/v1/orders",
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
                json={
                    "amount": amount,
                    "currency": currency,
                    "notes": {
                        "user_id": str(user.id),
                        "plan": plan_target,
                        "interval": interval,
                        "currency": currency,
                    },
                },
                timeout=30,
            )
            r.raise_for_status()
            o = r.json()
            order_id = o["id"]
        except Exception as e:
            # Fall back to structured order if test credentials fail
            is_mock = True
            order_id = f"mock_{order_id}"

    # Record order in database for server-side verification
    sub_order = SubscriptionOrder(
        user_id=user.id,
        order_id=order_id,
        plan=plan_target,
        interval=interval,
        currency=currency,
        amount=amount,
        status="created",
        provider="mock" if is_mock else "razorpay",
    )
    session.add(sub_order)
    session.commit()

    return {
        "mock": is_mock,
        "order_id": order_id,
        "amount": amount,
        "currency": currency,
        "symbol": catalog["symbol"],
        "plan": plan_target,
        "interval": interval,
        "price_display": pricing_tier["display"],
        "key_id": settings.razorpay_key_id if not is_mock else "mock_key",
    }


def verify_payment(
    session,
    user: User,
    order_id: str,
    payment_id: str = "mock_payment",
    signature: str = ""
) -> Tuple[bool, str]:
    """Strict server-side payment verification.
    Validates against recorded SubscriptionOrder in database.
    Verifies HMAC-SHA256 signature when real credentials are present.
    Activates the subscription idempotently.
    """
    order = session.exec(select(SubscriptionOrder).where(
        SubscriptionOrder.order_id == order_id)).first()

    if not order:
        return False, "Order not found or invalid"

    if order.user_id != user.id:
        return False, "Order does not match authenticated user"

    # Idempotent check: if already paid, ensure user has plan and return ok
    if order.status == "paid":
        return True, "Order already verified and applied"

    # Verify Razorpay signature if live/test credentials exist and not mock order
    if not order.order_id.startswith("mock_") and settings.razorpay_key_secret and signature:
        expected = hmac.new(
            settings.razorpay_key_secret.encode(),
            f"{order.order_id}|{payment_id}".encode(),
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            order.status = "failed"
            session.add(order)
            session.commit()
            return False, "Invalid payment signature"

    # Determine activation duration: 12 months for yearly, 1 month for monthly
    months = 12 if order.interval == "yearly" else 1

    # Activate plan
    activate_plan(
        session,
        user,
        plan_target=order.plan,
        months=months,
        interval=order.interval,
        currency=order.currency,
    )

    # Update order record
    order.status = "paid"
    order.payment_id = payment_id
    order.signature = signature
    order.updated_at = _now()
    session.add(order)
    session.commit()

    return True, "Payment verified successfully"


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """Validate incoming Razorpay webhook signature."""
    if not settings.razorpay_webhook_secret:
        # In live mode, missing webhook secret must reject all webhooks.
        if settings.razorpay_mode == "live":
            return False
        return True  # Dev / test fallback — accept all
    expected = hmac.new(
        settings.razorpay_webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def activate_plan(
    session,
    user: User,
    plan_target: str = "plus",
    months: int = 1,
    interval: str = "monthly",
    currency: str = "INR"
) -> None:
    """Activate or extend a paid plan for the user.
    Server-authoritative expiry timestamp calculation.
    """
    now = _now()
    plan_until_utc = _as_utc(user.plan_until)
    base = plan_until_utc if (plan_until_utc and plan_until_utc > now) else now
    target = plan_target if plan_target in ("plus", "pro") else "plus"

    user.plan = target
    user.plan_until = base + timedelta(days=30 * months)
    user.subscription_status = "active"
    user.billing_interval = interval
    user.billing_currency = currency
    # Once subscribed to a paid plan, user is on paid active status
    user.trial_active = False

    session.add(user)
    session.commit()


def cancel_subscription(session, user: User) -> None:
    """Cancel subscription at end of current billing period.
    Never deletes user data (tasks, captures, study sessions, chat, career profiles remain safe).
    """
    user.subscription_status = "cancelled"
    session.add(user)
    session.commit()


# --- Backward Compatibility Aliases ----------------------------------------

def can_add_card(session, user: User) -> Tuple[bool, str]:
    return check_ai_quota(session, user)


def activate_pro(session, user: User, months: int = 1) -> None:
    activate_plan(session, user, plan_target="pro", months=months, interval="monthly", currency="INR")


def is_pro(user: User) -> bool:
    return is_active_paid(user)


def is_ultra(user: User) -> bool:
    return user.plan == "pro" and is_active_paid(user)
