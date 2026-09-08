"""Comprehensive billing test suite for SparkDhi production billing hardening.

Tests:
- Pricing catalog (INR, USD, Plus, Pro, monthly, yearly)
- 14-day trial calculation
- Entitlement evaluation (trial, plus, pro, expired, cancelled)
- Checkout / mock mode
- Payment verification (valid, invalid, duplicate)
- Plan activation / idempotency
- Cancel subscription
- Webhook signature validation
- Webhook duplicate handling
- Missing credentials behavior (live vs test mode)
"""
import sys, os, hmac, hashlib, json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

# Ensure src package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from spark.config import get_settings

# --- Force test mode before importing subscription (which reads settings at import) ---
os.environ["RAZORPAY_KEY_ID"] = ""
os.environ["RAZORPAY_KEY_SECRET"] = ""
os.environ["RAZORPAY_WEBHOOK_SECRET"] = ""
os.environ["RAZORPAY_MODE"] = "test"

# Use a throw-away in-memory SQLite for tests
os.environ["DATABASE_URL"] = "sqlite://"

from sqlmodel import SQLModel, Session, create_engine
from spark.models import User, SubscriptionOrder
from spark import subscription


# ── Test DB Fixtures ────────────────────────────────────────────────────────────

@pytest.fixture
def engine():
    e = create_engine("sqlite://", echo=False)
    SQLModel.metadata.create_all(e)
    yield e


@pytest.fixture
def session(engine):
    with Session(engine) as s:
        yield s


@pytest.fixture
def trial_user(session):
    u = User(
        external_id="test_trial_1",
        email="trial@test.com",
        name="Trial User",
        plan="trial",
        trial_active=True,
        trial_started_at=datetime.now(timezone.utc),
        trial_expires_at=datetime.now(timezone.utc) + timedelta(days=14),
        subscription_status="trial",
    )
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


@pytest.fixture
def expired_user(session):
    u = User(
        external_id="test_expired_1",
        email="expired@test.com",
        name="Expired User",
        plan="expired",
        trial_active=False,
        trial_started_at=datetime.now(timezone.utc) - timedelta(days=30),
        trial_expires_at=datetime.now(timezone.utc) - timedelta(days=16),
        subscription_status="expired",
    )
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


@pytest.fixture
def plus_user(session):
    u = User(
        external_id="test_plus_1",
        email="plus@test.com",
        name="Plus User",
        plan="plus",
        plan_until=datetime.now(timezone.utc) + timedelta(days=25),
        trial_active=False,
        subscription_status="active",
        billing_interval="monthly",
        billing_currency="INR",
    )
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


@pytest.fixture
def pro_user(session):
    u = User(
        external_id="test_pro_1",
        email="pro@test.com",
        name="Pro User",
        plan="pro",
        plan_until=datetime.now(timezone.utc) + timedelta(days=300),
        trial_active=False,
        subscription_status="active",
        billing_interval="yearly",
        billing_currency="USD",
    )
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


# ═══════════════════════════════════════════════════════════════════════════════
# 1. PRICING CATALOG
# ═══════════════════════════════════════════════════════════════════════════════

class TestPricingCatalog:
    def test_inr_exists(self):
        assert "INR" in subscription.PRICING_CATALOG

    def test_usd_exists(self):
        assert "USD" in subscription.PRICING_CATALOG

    # --- India INR Pricing (unchanged) ---
    def test_inr_plus_monthly_price(self):
        p = subscription.PRICING_CATALOG["INR"]["plans"]["plus"]["monthly"]
        assert p["price"] == 599
        assert p["amount"] == 59900  # paise
        assert p["display"] == "₹599"

    def test_inr_plus_yearly_price(self):
        p = subscription.PRICING_CATALOG["INR"]["plans"]["plus"]["yearly"]
        assert p["price"] == 5990
        assert p["amount"] == 599000
        assert p["display"] == "₹5,990"

    def test_inr_pro_monthly_price(self):
        p = subscription.PRICING_CATALOG["INR"]["plans"]["pro"]["monthly"]
        assert p["price"] == 999
        assert p["amount"] == 99900
        assert p["display"] == "₹999"

    def test_inr_pro_yearly_price(self):
        p = subscription.PRICING_CATALOG["INR"]["plans"]["pro"]["yearly"]
        assert p["price"] == 9990
        assert p["amount"] == 999000
        assert p["display"] == "₹9,990"

    # --- Global USD Pricing (updated) ---
    def test_usd_plus_monthly_price(self):
        p = subscription.PRICING_CATALOG["USD"]["plans"]["plus"]["monthly"]
        assert p["price"] == 10
        assert p["amount"] == 1000  # cents
        assert p["display"] == "$10"

    def test_usd_plus_yearly_price(self):
        p = subscription.PRICING_CATALOG["USD"]["plans"]["plus"]["yearly"]
        assert p["price"] == 100
        assert p["amount"] == 10000
        assert p["display"] == "$100"

    def test_usd_pro_monthly_price(self):
        p = subscription.PRICING_CATALOG["USD"]["plans"]["pro"]["monthly"]
        assert p["price"] == 13
        assert p["amount"] == 1300
        assert p["display"] == "$13"

    def test_usd_pro_yearly_price(self):
        p = subscription.PRICING_CATALOG["USD"]["plans"]["pro"]["yearly"]
        assert p["price"] == 130
        assert p["amount"] == 13000
        assert p["display"] == "$130"

    # --- Annual = 10 months (SAVE 2 MONTHS) ---
    def test_inr_plus_annual_is_10_months(self):
        m = subscription.PRICING_CATALOG["INR"]["plans"]["plus"]["monthly"]["price"]
        y = subscription.PRICING_CATALOG["INR"]["plans"]["plus"]["yearly"]["price"]
        assert y == m * 10

    def test_inr_pro_annual_is_10_months(self):
        m = subscription.PRICING_CATALOG["INR"]["plans"]["pro"]["monthly"]["price"]
        y = subscription.PRICING_CATALOG["INR"]["plans"]["pro"]["yearly"]["price"]
        assert y == m * 10

    def test_usd_plus_annual_is_10_months(self):
        m = subscription.PRICING_CATALOG["USD"]["plans"]["plus"]["monthly"]["price"]
        y = subscription.PRICING_CATALOG["USD"]["plans"]["plus"]["yearly"]["price"]
        assert y == m * 10

    def test_usd_pro_annual_is_10_months(self):
        m = subscription.PRICING_CATALOG["USD"]["plans"]["pro"]["monthly"]["price"]
        y = subscription.PRICING_CATALOG["USD"]["plans"]["pro"]["yearly"]["price"]
        assert y == m * 10

    # Ensure no old prices remain
    def test_no_old_usd_12_price(self):
        p = subscription.PRICING_CATALOG["USD"]["plans"]["plus"]["monthly"]
        assert p["price"] != 12

    def test_no_old_usd_15_price(self):
        p = subscription.PRICING_CATALOG["USD"]["plans"]["pro"]["monthly"]
        assert p["price"] != 15


# ═══════════════════════════════════════════════════════════════════════════════
# 2. TRIAL SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

class TestTrialSystem:
    def test_trial_is_active(self, trial_user):
        assert subscription.is_trial_active(trial_user) is True

    def test_expired_trial_is_inactive(self, expired_user):
        assert subscription.is_trial_active(expired_user) is False

    def test_trial_exactly_14_days(self, trial_user):
        delta = trial_user.trial_expires_at - trial_user.trial_started_at
        assert 13 <= delta.days <= 14  # within tolerance

    def test_paid_user_trial_inactive(self, plus_user):
        assert subscription.is_trial_active(plus_user) is False


# ═══════════════════════════════════════════════════════════════════════════════
# 3. ENTITLEMENT EVALUATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestEntitlements:
    def test_trial_entitlements(self, session, trial_user):
        ent = subscription.get_user_entitlements(trial_user, session)
        assert ent["effective_plan"] in ("trial", "pro")  # trial = full access
        assert ent["subscription_status"] == "trial"

    def test_plus_entitlements(self, session, plus_user):
        ent = subscription.get_user_entitlements(plus_user, session)
        assert ent["current_plan"] == "plus"
        assert ent["effective_plan"] == "plus"
        assert ent["subscription_status"] == "active"
        assert ent["is_active_paid"] is True

    def test_pro_entitlements(self, session, pro_user):
        ent = subscription.get_user_entitlements(pro_user, session)
        assert ent["current_plan"] == "pro"
        assert ent["effective_plan"] == "pro"
        assert ent["is_active_paid"] is True

    def test_expired_entitlements(self, session, expired_user):
        ent = subscription.get_user_entitlements(expired_user, session)
        assert ent["effective_plan"] == "expired"
        assert ent["is_active_paid"] is False

    def test_cancelled_entitlements(self, session, plus_user):
        subscription.cancel_subscription(session, plus_user)
        ent = subscription.get_user_entitlements(plus_user, session)
        assert ent["subscription_status"] == "cancelled"

    def test_feature_access_trial(self, session, trial_user):
        assert subscription.has_feature_access(trial_user, "ai_generation") is True

    def test_feature_access_expired(self, session, expired_user):
        assert subscription.has_feature_access(expired_user, "ai_generation") is False


# ═══════════════════════════════════════════════════════════════════════════════
# 4. CHECKOUT (MOCK MODE)
# ═══════════════════════════════════════════════════════════════════════════════

class TestCheckout:
    def test_mock_checkout_plus_inr(self, session, trial_user):
        result = subscription.create_checkout(
            session, trial_user, plan_target="plus", interval="monthly", currency="INR"
        )
        assert result["mock"] is True
        assert result["plan"] == "plus"
        assert result["interval"] == "monthly"
        assert "order_id" in result

    def test_mock_checkout_pro_usd_yearly(self, session, trial_user):
        result = subscription.create_checkout(
            session, trial_user, plan_target="pro", interval="yearly", currency="USD"
        )
        assert result["mock"] is True
        assert result["plan"] == "pro"
        assert result["interval"] == "yearly"

    def test_checkout_creates_order_record(self, session, trial_user):
        result = subscription.create_checkout(
            session, trial_user, plan_target="plus", interval="monthly", currency="INR"
        )

        # Query the order from DB
        from sqlmodel import select
        order = session.exec(
            select(SubscriptionOrder).where(SubscriptionOrder.order_id == result["order_id"])
        ).first()
        assert order is not None
        assert order.user_id == trial_user.id
        assert order.plan == "plus"
        assert order.status == "created"

    def test_live_mode_rejects_missing_credentials(self, session, trial_user):
        """In live mode, missing credentials must raise an error."""
        with patch.object(subscription.settings, "razorpay_mode", "live"):
            with patch.object(subscription.settings, "razorpay_key_id", ""):
                with patch.object(subscription.settings, "razorpay_key_secret", ""):
                    with pytest.raises(ValueError, match="LIVE mode requires"):
                        subscription.create_checkout(
                            session, trial_user, plan_target="plus",
                            interval="monthly", currency="INR"
                        )


# ═══════════════════════════════════════════════════════════════════════════════
# 5. PAYMENT VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestPaymentVerification:
    def test_verify_valid_mock_payment(self, session, trial_user):
        result = subscription.create_checkout(
            session, trial_user, plan_target="plus", interval="monthly", currency="INR"
        )
        ok, msg = subscription.verify_payment(
            session, trial_user,
            order_id=result["order_id"],
            payment_id="mock_payment",
            signature=""
        )
        assert ok is True
        assert trial_user.plan == "plus"
        assert trial_user.subscription_status == "active"

    def test_verify_invalid_order(self, session, trial_user):
        ok, msg = subscription.verify_payment(
            session, trial_user,
            order_id="nonexistent_order_id",
            payment_id="anything",
            signature=""
        )
        assert ok is False
        assert "not found" in msg.lower()

    def test_verify_wrong_user(self, session, trial_user, expired_user):
        result = subscription.create_checkout(
            session, trial_user, plan_target="plus", interval="monthly", currency="INR"
        )
        ok, msg = subscription.verify_payment(
            session, expired_user,
            order_id=result["order_id"],
            payment_id="mock_payment",
            signature=""
        )
        assert ok is False
        assert "does not match" in msg.lower()

    def test_verify_duplicate_payment_is_idempotent(self, session, trial_user):
        result = subscription.create_checkout(
            session, trial_user, plan_target="plus", interval="monthly", currency="INR"
        )
        # First verification
        ok1, _ = subscription.verify_payment(
            session, trial_user,
            order_id=result["order_id"],
            payment_id="mock_payment",
            signature=""
        )
        assert ok1 is True
        # Second verification (duplicate) — should succeed idempotently
        ok2, msg2 = subscription.verify_payment(
            session, trial_user,
            order_id=result["order_id"],
            payment_id="mock_payment",
            signature=""
        )
        assert ok2 is True
        assert "already" in msg2.lower()

    def test_verify_invalid_signature(self, session, trial_user):
        """When real credentials exist, invalid signature must fail."""
        result = subscription.create_checkout(
            session, trial_user, plan_target="plus", interval="monthly", currency="INR"
        )
        # Patch settings to simulate real credentials
        # Need a non-mock order (rename it)
        from sqlmodel import select
        order = session.exec(
            select(SubscriptionOrder).where(SubscriptionOrder.order_id == result["order_id"])
        ).first()
        # Overwrite order_id to not start with mock_ so signature is checked
        order.order_id = "order_real_test_123"
        session.add(order)
        session.commit()

        with patch.object(subscription.settings, "razorpay_key_secret", "test_secret"):
            ok, msg = subscription.verify_payment(
                session, trial_user,
                order_id="order_real_test_123",
                payment_id="pay_test_123",
                signature="invalid_signature_here"
            )
            assert ok is False
            assert "invalid" in msg.lower() or "signature" in msg.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# 6. PLAN ACTIVATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestPlanActivation:
    def test_activate_plus_monthly(self, session, trial_user):
        subscription.activate_plan(session, trial_user, plan_target="plus", months=1, interval="monthly", currency="INR")
        assert trial_user.plan == "plus"
        assert trial_user.subscription_status == "active"
        assert trial_user.trial_active is False
        assert trial_user.plan_until is not None

    def test_activate_pro_yearly(self, session, trial_user):
        subscription.activate_plan(session, trial_user, plan_target="pro", months=12, interval="yearly", currency="USD")
        assert trial_user.plan == "pro"
        assert trial_user.billing_interval == "yearly"
        assert trial_user.billing_currency == "USD"

    def test_activate_extends_existing(self, session, plus_user):
        old_until = plus_user.plan_until
        subscription.activate_plan(session, plus_user, plan_target="plus", months=1, interval="monthly", currency="INR")
        assert plus_user.plan_until > old_until

    def test_renewal_extends_from_current_expiry(self, session, plus_user):
        """Renewal should extend from current plan_until, not from now."""
        old_until = plus_user.plan_until
        subscription.activate_plan(session, plus_user, plan_target="plus", months=1, interval="monthly", currency="INR")
        # Should extend from old_until, not from now
        expected = old_until + timedelta(days=30)
        actual = plus_user.plan_until
        assert abs((actual - expected).total_seconds()) < 60


# ═══════════════════════════════════════════════════════════════════════════════
# 7. CANCEL SUBSCRIPTION
# ═══════════════════════════════════════════════════════════════════════════════

class TestCancelSubscription:
    def test_cancel_sets_status(self, session, plus_user):
        subscription.cancel_subscription(session, plus_user)
        assert plus_user.subscription_status == "cancelled"

    def test_cancel_preserves_plan(self, session, plus_user):
        subscription.cancel_subscription(session, plus_user)
        assert plus_user.plan == "plus"  # Plan stays until period end

    def test_cancel_preserves_plan_until(self, session, plus_user):
        old_until = plus_user.plan_until
        subscription.cancel_subscription(session, plus_user)
        assert plus_user.plan_until == old_until


# ═══════════════════════════════════════════════════════════════════════════════
# 8. WEBHOOK SIGNATURE VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestWebhookSignature:
    def test_valid_signature(self):
        secret = "test_webhook_secret"
        body = b'{"event":"payment.captured","payload":{}}'
        expected_sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        with patch.object(subscription.settings, "razorpay_webhook_secret", secret):
            result = subscription.verify_webhook_signature(body, expected_sig)
        assert result is True

    def test_invalid_signature(self):
        secret = "test_webhook_secret"
        body = b'{"event":"payment.captured"}'

        with patch.object(subscription.settings, "razorpay_webhook_secret", secret):
            result = subscription.verify_webhook_signature(body, "wrong_signature")
        assert result is False

    def test_missing_signature(self):
        secret = "test_webhook_secret"
        body = b'{"event":"payment.captured"}'

        with patch.object(subscription.settings, "razorpay_webhook_secret", secret):
            result = subscription.verify_webhook_signature(body, "")
        assert result is False

    def test_test_mode_no_secret_accepts(self):
        """Test mode with no webhook secret should accept all (dev convenience)."""
        with patch.object(subscription.settings, "razorpay_webhook_secret", ""):
            with patch.object(subscription.settings, "razorpay_mode", "test"):
                result = subscription.verify_webhook_signature(b"anything", "")
        assert result is True

    def test_live_mode_no_secret_rejects(self):
        """Live mode with no webhook secret must reject all webhooks."""
        with patch.object(subscription.settings, "razorpay_webhook_secret", ""):
            with patch.object(subscription.settings, "razorpay_mode", "live"):
                result = subscription.verify_webhook_signature(b"anything", "")
        assert result is False


# ═══════════════════════════════════════════════════════════════════════════════
# 9. WEBHOOK DUPLICATE HANDLING
# ═══════════════════════════════════════════════════════════════════════════════

class TestWebhookDuplicateHandling:
    def test_paid_order_not_reprocessed(self, session, trial_user):
        """An order already marked 'paid' should not be re-activated."""
        result = subscription.create_checkout(
            session, trial_user, plan_target="plus", interval="monthly", currency="INR"
        )
        # Mark order as paid
        from sqlmodel import select
        order = session.exec(
            select(SubscriptionOrder).where(SubscriptionOrder.order_id == result["order_id"])
        ).first()
        order.status = "paid"
        order.payment_id = "pay_first"
        session.add(order)
        session.commit()

        # Attempt verify again — should be idempotent
        ok, msg = subscription.verify_payment(
            session, trial_user,
            order_id=result["order_id"],
            payment_id="pay_second",
            signature=""
        )
        assert ok is True
        assert "already" in msg.lower()
        # Order should still show first payment_id
        session.refresh(order)
        assert order.payment_id == "pay_first"


# ═══════════════════════════════════════════════════════════════════════════════
# 10. MISSING CREDENTIALS BEHAVIOR
# ═══════════════════════════════════════════════════════════════════════════════

class TestMissingCredentials:
    def test_config_no_hardcoded_keys(self):
        """Config defaults must NOT contain Razorpay test/live keys."""
        settings = get_settings()
        # Defaults should be empty (actual keys come from .env)
        # We set them to "" in env vars for tests, so they should be ""
        assert settings.razorpay_key_id == ""
        assert settings.razorpay_key_secret == ""

    def test_config_has_mode(self):
        settings = get_settings()
        assert hasattr(settings, "razorpay_mode")
        assert settings.razorpay_mode in ("test", "live")

    def test_mock_fallback_in_test_mode(self, session, trial_user):
        """In test mode, missing credentials should produce mock orders."""
        with patch.object(subscription.settings, "razorpay_mode", "test"):
            with patch.object(subscription.settings, "razorpay_key_id", ""):
                result = subscription.create_checkout(
                    session, trial_user, plan_target="plus",
                    interval="monthly", currency="INR"
                )
                assert result["mock"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# 11. QUOTA ENFORCEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class TestQuotaEnforcement:
    def test_expired_user_quota_denied(self, session, expired_user):
        ok, msg = subscription.check_ai_quota(session, expired_user)
        assert ok is False

    def test_trial_user_quota_allowed(self, session, trial_user):
        ok, msg = subscription.check_ai_quota(session, trial_user)
        assert ok is True

    def test_plus_user_quota_allowed(self, session, plus_user):
        ok, msg = subscription.check_ai_quota(session, plus_user)
        assert ok is True


# ═══════════════════════════════════════════════════════════════════════════════
# 12. STATUS FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

class TestStatusFunctions:
    def test_is_active_paid(self, plus_user):
        assert subscription.is_active_paid(plus_user) is True

    def test_is_active_paid_expired(self, expired_user):
        assert subscription.is_active_paid(expired_user) is False

    def test_get_current_plan(self, plus_user):
        assert subscription.get_current_plan(plus_user) == "plus"

    def test_get_effective_plan_trial(self, trial_user, session):
        assert subscription.get_effective_plan(trial_user) in ("trial", "pro")

    def test_get_effective_plan_expired(self, expired_user, session):
        assert subscription.get_effective_plan(expired_user) == "expired"

    def test_get_subscription_status(self, plus_user):
        assert subscription.get_subscription_status(plus_user) == "active"

    def test_get_subscription_status_trial(self, trial_user):
        assert subscription.get_subscription_status(trial_user) == "trial"
