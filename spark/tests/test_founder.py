"""Comprehensive automated test suite for SparkDhi Founder Account & Testing Mode.

Tests:
1. Unauthenticated requests to founder endpoints are rejected (401).
2. Standard users are strictly rejected with 403 Forbidden.
3. Founder authorization via DB role='founder' grants full unmetered access.
4. Founder authorization via SPARK_FOUNDER_EMAILS environment configuration.
5. In-situ testing mode switcher ('default', 'free', 'plus', 'pro') and paywall simulation.
6. Billing separation: zero fake SubscriptionOrder records or payment mutations.
7. Administrative CLI management (grant-founder, revoke-founder) and audit trail (RoleAuditLog).
"""
import sys
import os
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

# Ensure src package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Use a dedicated SQLite file for founder test suite
test_db_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_founder_tmp.db"))
if os.path.exists(test_db_file):
    try:
        os.remove(test_db_file)
    except Exception:
        pass

os.environ["DATABASE_URL"] = f"sqlite:///{test_db_file}"
os.environ["RAZORPAY_MODE"] = "test"
os.environ["SPARK_FOUNDER_EMAILS"] = "config_founder@sparkdhi.ai,secondary_founder@sparkdhi.ai"

from spark.config import get_settings
get_settings.cache_clear()

from spark.models import User, RoleAuditLog, SubscriptionOrder, get_session, init_db
from spark.auth import (
    hash_password,
    make_token,
    is_founder,
)
from spark import subscription
from spark.cli import grant_founder, revoke_founder, list_audit_log
from spark.main import app


def get_err(res) -> str:
    """Helper to extract error message regardless of exception schema."""
    d = res.json()
    if isinstance(d, dict):
        if "error" in d and isinstance(d["error"], dict):
            return d["error"].get("message", "")
        return d.get("detail") or d.get("message") or ""
    return str(d)


@pytest.fixture(scope="session", autouse=True)
def session_setup():
    init_db()
    yield
    if os.path.exists(test_db_file):
        try:
            os.remove(test_db_file)
        except Exception:
            pass


@pytest.fixture(autouse=True)
def clean_db():
    with get_session() as s:
        for r in s.exec(select(RoleAuditLog)).all():
            s.delete(r)
        for o in s.exec(select(SubscriptionOrder)).all():
            s.delete(o)
        for u in s.exec(select(User).where(User.email.in_([
            "standard@example.com",
            "db_founder@sparkdhi.ai",
            "config_founder@sparkdhi.ai",
            "cli_target@sparkdhi.ai",
        ]))).all():
            subscription.clear_founder_test_mode(u.id)
            s.delete(u)
        s.commit()
    yield


@pytest.fixture
def standard_user():
    with get_session() as s:
        u = User(
            external_id="std_1",
            email="standard@example.com",
            name="Regular User",
            role="user",
            hashed_password=hash_password("UserPass123!"),
        )
        s.add(u)
        s.commit()
        s.refresh(u)
        return u


@pytest.fixture
def db_founder_user():
    with get_session() as s:
        u = User(
            external_id="fnd_1",
            email="db_founder@sparkdhi.ai",
            name="DB Founder",
            role="founder",
            hashed_password=hash_password("FounderPass123!"),
        )
        s.add(u)
        s.commit()
        s.refresh(u)
        return u


@pytest.fixture
def config_founder_user():
    with get_session() as s:
        u = User(
            external_id="fnd_2",
            email="config_founder@sparkdhi.ai",
            name="Config Founder",
            role="user",  # role in DB is standard user, but email is in SPARK_FOUNDER_EMAILS
            hashed_password=hash_password("ConfigFounderPass123!"),
        )
        s.add(u)
        s.commit()
        s.refresh(u)
        return u


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# ── 1. Unauthenticated Requests ───────────────────────────────────────────────

def test_founder_endpoints_require_auth(client):
    """Anonymous or invalid token calls to /api/founder/* must be rejected."""
    # 1. Missing Authorization header rejected with 403 (FastAPI HTTPBearer)
    r1 = client.get("/api/founder/status")
    assert r1.status_code == 403

    r2 = client.post("/api/founder/test-mode", json={"mode": "free"})
    assert r2.status_code == 403

    # 2. Invalid or expired token rejected with 401 Unauthorized
    bad_headers = {"Authorization": "Bearer invalid.fake.token"}
    r3 = client.get("/api/founder/status", headers=bad_headers)
    assert r3.status_code == 401

    r4 = client.post("/api/founder/test-mode", json={"mode": "free"}, headers=bad_headers)
    assert r4.status_code == 401


# ── 2. Standard Users Rejected (Server-side Enforced) ─────────────────────────

def test_standard_user_rejected_with_403(client, standard_user):
    """A standard user holding a valid JWT cannot access founder endpoints."""
    tok = make_token(standard_user)
    headers = {"Authorization": f"Bearer {tok}"}

    r1 = client.get("/api/founder/status", headers=headers)
    assert r1.status_code == 403
    assert "restricted to SparkDhi Founder" in get_err(r1)

    r2 = client.post("/api/founder/test-mode", json={"mode": "free"}, headers=headers)
    assert r2.status_code == 403
    assert "restricted to SparkDhi Founder" in get_err(r2)


def test_client_spoofed_role_in_payload_ignored(client, standard_user):
    """Client cannot spoof founder role via request headers or body."""
    tok = make_token(standard_user)
    headers = {
        "Authorization": f"Bearer {tok}",
        "X-User-Role": "founder",
        "Role": "founder",
    }
    r = client.get("/api/founder/status", headers=headers)
    assert r.status_code == 403


# ── 3. Founder Via Database Role ──────────────────────────────────────────────

def test_db_founder_access_and_unmetered_limits(client, db_founder_user):
    """Founder via database role='founder' has full access and unmetered quotas."""
    assert is_founder(db_founder_user) is True

    tok = make_token(db_founder_user)
    headers = {"Authorization": f"Bearer {tok}"}

    r = client.get("/api/founder/status", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["is_founder"] is True
    assert data["role"] == "founder"
    assert data["active_test_mode"] == "default"
    assert data["effective_plan"] == "pro"
    assert data["limits"]["ai_calls_per_day"] == 10000
    assert data["limits"]["max_uploads"] == 500

    # Verify /api/me reflects is_founder
    r_me = client.get("/api/me", headers=headers)
    assert r_me.status_code == 200
    me_data = r_me.json()
    assert me_data["is_founder"] is True
    assert me_data["role"] == "founder"


# ── 4. Founder Via SPARK_FOUNDER_EMAILS ────────────────────────────────────────

def test_config_env_founder_access(client, config_founder_user):
    """Founder via SPARK_FOUNDER_EMAILS config has founder privileges regardless of DB role."""
    assert config_founder_user.role == "user"
    assert is_founder(config_founder_user) is True

    tok = make_token(config_founder_user)
    headers = {"Authorization": f"Bearer {tok}"}

    r = client.get("/api/founder/status", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["is_founder"] is True


# ── 5. In-situ Testing Mode Switcher ──────────────────────────────────────────

def test_founder_test_mode_switching_and_paywall_simulation(client, db_founder_user):
    """Founder can dynamically simulate 'free', 'plus', 'pro', and 'default' tiers."""
    tok = make_token(db_founder_user)
    headers = {"Authorization": f"Bearer {tok}"}

    # 1. Switch to 'free' (simulates expired / paywall mode)
    r_free = client.post("/api/founder/test-mode", json={"mode": "free"}, headers=headers)
    assert r_free.status_code == 200
    assert r_free.json()["active_test_mode"] == "free"
    assert r_free.json()["effective_plan"] == "expired"
    assert r_free.json()["limits"]["ai_calls_per_day"] == 0
    # Feature checks in subscription module
    assert subscription.has_feature_access(db_founder_user, "advanced_ai") is False

    # 2. Switch to 'plus' (simulates intermediate paid tier)
    r_plus = client.post("/api/founder/test-mode", json={"mode": "plus"}, headers=headers)
    assert r_plus.status_code == 200
    assert r_plus.json()["active_test_mode"] == "plus"
    assert r_plus.json()["effective_plan"] == "plus"
    assert r_plus.json()["limits"]["ai_calls_per_day"] == 100
    assert subscription.has_feature_access(db_founder_user, "voice_interview") is False
    assert subscription.has_feature_access(db_founder_user, "advanced_ai") is True

    # 3. Switch to 'pro' (simulates full consumer paid tier)
    r_pro = client.post("/api/founder/test-mode", json={"mode": "pro"}, headers=headers)
    assert r_pro.status_code == 200
    assert r_pro.json()["active_test_mode"] == "pro"
    assert r_pro.json()["effective_plan"] == "pro"
    assert subscription.has_feature_access(db_founder_user, "voice_interview") is True

    # 4. Switch back to 'default' (unmetered founder state)
    r_def = client.post("/api/founder/test-mode", json={"mode": "default"}, headers=headers)
    assert r_def.status_code == 200
    assert r_def.json()["active_test_mode"] == "default"
    assert r_def.json()["limits"]["ai_calls_per_day"] == 10000

    # 5. Invalid mode returns 400 Bad Request
    r_inv = client.post("/api/founder/test-mode", json={"mode": "invalid_mode"}, headers=headers)
    assert r_inv.status_code == 400
    assert "Invalid test mode" in get_err(r_inv)


# ── 6. Billing Separation ─────────────────────────────────────────────────────

def test_billing_separation_no_fake_orders_created(client, db_founder_user):
    """Founder operations must never create fake SubscriptionOrder records or touch payment gateway."""
    with get_session() as s:
        initial_order_count = len(s.exec(select(SubscriptionOrder)).all())

    tok = make_token(db_founder_user)
    headers = {"Authorization": f"Bearer {tok}"}

    # Perform founder actions
    client.get("/api/founder/status", headers=headers)
    client.post("/api/founder/test-mode", json={"mode": "pro"}, headers=headers)
    client.get("/api/me", headers=headers)

    with get_session() as s:
        final_order_count = len(s.exec(select(SubscriptionOrder)).all())
        user_in_db = s.get(User, db_founder_user.id)
        # Verify no fake payment IDs were injected
        assert user_in_db.razorpay_customer_id is None or user_in_db.razorpay_customer_id == ""

    assert initial_order_count == 0
    assert final_order_count == 0


# ── 7. Admin CLI & RoleAuditLog ───────────────────────────────────────────────

def test_cli_grant_and_revoke_with_audit_trail():
    """CLI grant-founder and revoke-founder update user role and generate immutable audit logs."""
    # Create target user
    with get_session() as s:
        target = User(
            external_id="cli_target_ext",
            email="cli_target@sparkdhi.ai",
            name="Target User",
            role="user",
            hashed_password=hash_password("Pass123!"),
        )
        s.add(target)
        s.commit()
        s.refresh(target)
        target_id = target.id

    # 1. Grant founder via CLI function
    res_grant = grant_founder("cli_target@sparkdhi.ai", granted_by="lead_admin", reason="Production founder onboarding")
    assert res_grant["ok"] is True
    assert res_grant["role"] == "founder"
    assert res_grant["previous_role"] == "user"

    # Check user in DB
    with get_session() as s:
        u = s.get(User, target_id)
        assert u.role == "founder"

        # Verify audit log record
        logs = s.exec(select(RoleAuditLog).where(RoleAuditLog.user_id == target_id)).all()
        assert len(logs) == 1
        assert logs[0].granted_by == "lead_admin"
        assert logs[0].role_granted == "founder"
        assert logs[0].previous_role == "user"
        assert logs[0].reason == "Production founder onboarding"

    # 2. Revoke founder via CLI function
    res_revoke = revoke_founder("cli_target@sparkdhi.ai", revoked_by="lead_admin", reason="Temporary test ended")
    assert res_revoke["ok"] is True
    assert res_revoke["role"] == "user"

    # Check user in DB
    with get_session() as s:
        u = s.get(User, target_id)
        assert u.role == "user"

        # Verify second audit log record
        logs = s.exec(select(RoleAuditLog).where(RoleAuditLog.user_id == target_id).order_by(RoleAuditLog.created_at.asc())).all()
        assert len(logs) == 2
        assert logs[1].granted_by == "lead_admin"
        assert logs[1].role_granted == "user"
        assert logs[1].previous_role == "founder"
        assert logs[1].reason == "Temporary test ended"

    # 3. Verify list_audit_log utility
    audit_list = list_audit_log("cli_target@sparkdhi.ai")
    assert len(audit_list) == 2
