"""Comprehensive test suite for SparkDhi Auth (Forgot Password & Reset) and Shared Resume (Career + Coach).

Tests:
1. Token generation, SHA-256 hashing, and database storage
2. Anti-enumeration behavior in forgot-password flow
3. Token validation (valid, expired, used, tampered)
4. Password consumption and verification
5. Rate limiting on reset requests
6. Resume upload format validation (.pdf, .docx, .doc, .txt)
7. Resume upload 10MB file size limit enforcement
8. Coach resume upload syncing with UserCareerProfile
9. Interview start with use_saved_resume flag
10. Data isolation between distinct users
"""
import sys
import os
import io
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlmodel import select

# Ensure src package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Use a shared SQLite file for all test connections and thread pools
test_db_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_auth_tmp.db"))
if os.path.exists(test_db_file):
    try:
        os.remove(test_db_file)
    except Exception:
        pass

os.environ["DATABASE_URL"] = f"sqlite:///{test_db_file}"
os.environ["RAZORPAY_MODE"] = "test"

from spark.config import get_settings
get_settings.cache_clear()

from spark.models import User, PasswordResetToken, UserCareerProfile, InterviewSession, get_session, init_db
from spark.auth import (
    hash_password,
    verify_password,
    hash_token,
    create_password_reset_token,
    validate_reset_token,
    verify_and_consume_reset_token,
    check_reset_rate_limit,
    make_token,
)
from spark.main import app


def get_err(res) -> str:
    """Helper to extract error message regardless of exception handler schema."""
    d = res.json()
    if isinstance(d, dict):
        if "error" in d and isinstance(d["error"], dict):
            return d["error"].get("message", "")
        return d.get("detail") or d.get("message") or ""
    return str(d)


# ── Fixtures ──────────────────────────────────────────────────────────────────

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
        for t in s.exec(select(PasswordResetToken)).all():
            s.delete(t)
        for i in s.exec(select(InterviewSession)).all():
            s.delete(i)
        for p in s.exec(select(UserCareerProfile)).all():
            s.delete(p)
        for u in s.exec(select(User).where(User.email.in_(["candidate@example.com", "other@example.com"]))).all():
            s.delete(u)
        s.commit()
    yield


@pytest.fixture
def test_session():
    with get_session() as session:
        yield session


@pytest.fixture
def test_user(test_session):
    u = User(
        external_id="ext_user_1",
        email="candidate@example.com",
        name="Candidate One",
        hashed_password=hash_password("OriginalPassword123!"),
    )
    test_session.add(u)
    test_session.commit()
    test_session.refresh(u)
    return u


@pytest.fixture
def second_user(test_session):
    u = User(
        external_id="ext_user_2",
        email="other@example.com",
        name="Candidate Two",
        hashed_password=hash_password("OriginalPassword456!"),
    )
    test_session.add(u)
    test_session.commit()
    test_session.refresh(u)
    return u


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# ── Unit Tests: Password Reset Core ───────────────────────────────────────────

def test_token_hash_reproducibility():
    token = "random-token-xyz-12345"
    h1 = hash_token(token)
    h2 = hash_token(token)
    assert h1 == h2
    assert len(h1) == 64
    assert h1 != token


def test_create_and_validate_reset_token(test_session, test_user):
    plain_token = create_password_reset_token(test_session, test_user)
    assert plain_token is not None

    # Check DB record
    token_record = test_session.exec(
        select(PasswordResetToken).where(PasswordResetToken.user_id == test_user.id)
    ).first()
    assert token_record is not None
    assert token_record.token_hash == hash_token(plain_token)
    assert token_record.used is False

    # Validate token
    res = validate_reset_token(test_session, plain_token)
    assert res is not None
    user, record = res
    assert user.id == test_user.id
    assert record.id == token_record.id


def test_validate_reset_token_invalid(test_session, test_user):
    res = validate_reset_token(test_session, "nonexistent-token")
    assert res is None


def test_validate_reset_token_expired(test_session, test_user):
    plain_token = create_password_reset_token(test_session, test_user, ttl_minutes=-10)
    res = validate_reset_token(test_session, plain_token)
    assert res is None


def test_validate_reset_token_used(test_session, test_user):
    plain_token = create_password_reset_token(test_session, test_user)
    record = test_session.exec(
        select(PasswordResetToken).where(PasswordResetToken.user_id == test_user.id)
    ).first()
    record.used = True
    test_session.add(record)
    test_session.commit()

    res = validate_reset_token(test_session, plain_token)
    assert res is None


def test_verify_and_consume_reset_token(test_session, test_user):
    plain_token = create_password_reset_token(test_session, test_user)
    new_password = "BrandNewSecurePassword2026!"

    updated_user = verify_and_consume_reset_token(test_session, plain_token, new_password)
    assert updated_user.id == test_user.id

    # Verify old password fails
    assert verify_password("OriginalPassword123!", updated_user.hashed_password) is False
    # Verify new password succeeds
    assert verify_password(new_password, updated_user.hashed_password) is True

    # Check token record marked as used
    record = test_session.exec(
        select(PasswordResetToken).where(PasswordResetToken.user_id == test_user.id)
    ).first()
    assert record.used is True

    # Consuming again must fail
    with pytest.raises(HTTPException) as exc:
        verify_and_consume_reset_token(test_session, plain_token, "AnotherPassword!")
    assert exc.value.status_code == 400


def test_reset_rate_limiting():
    clean_email = "ratelimit_candidate@example.com"
    # Should allow 5 requests
    for _ in range(5):
        assert check_reset_rate_limit(clean_email) is True
    # 6th request within window must be rejected
    assert check_reset_rate_limit(clean_email) is False


# ── API Endpoint Tests: Password Reset Flow ───────────────────────────────────

def test_api_forgot_password_anti_enumeration(client, test_user):
    # Case 1: Existing user email -> 200 with standard anti-enumeration message
    res1 = client.post("/api/auth/forgot-password", json={"email": "candidate@example.com"})
    assert res1.status_code == 200
    data1 = res1.json()
    assert "If an account exists" in data1["message"]

    # Case 2: Non-existent user email -> Also 200 with EXACT same message
    res2 = client.post("/api/auth/forgot-password", json={"email": "nonexistent@example.com"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["message"] == data1["message"]


def test_api_verify_reset_token_endpoint(client, test_session, test_user):
    plain_token = create_password_reset_token(test_session, test_user)

    res = client.post("/api/auth/verify-reset-token", json={"token": plain_token})
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert "@" in data["masked_email"]
    assert data["masked_email"] != test_user.email  # Masked, not exposed raw

    # Tampered token
    bad_res = client.post("/api/auth/verify-reset-token", json={"token": "tampered_token"})
    assert bad_res.status_code == 400


def test_api_reset_password_endpoint(client, test_session, test_user):
    plain_token = create_password_reset_token(test_session, test_user)

    # Short password rejected
    short_res = client.post("/api/auth/reset-password", json={"token": plain_token, "new_password": "short"})
    assert short_res.status_code == 400
    assert "at least 8 characters" in get_err(short_res)

    # Successful reset
    new_pw = "SuperSecurePassword999!"
    res = client.post("/api/auth/reset-password", json={"token": plain_token, "new_password": new_pw})
    assert res.status_code == 200
    assert "successful" in res.json()["message"]

    # Can log in with new password
    login_res = client.post("/api/auth/login", json={"email": "candidate@example.com", "password": new_pw})
    assert login_res.status_code == 200
    assert "token" in login_res.json()

    # Reusing the token must fail
    reused_res = client.post("/api/auth/reset-password", json={"token": plain_token, "new_password": "AnotherOne123!"})
    assert reused_res.status_code == 400


# ── Shared Resume Tests (Career + Coach) ───────────────────────────────────────

def test_resume_upload_format_validation(client, test_user):
    auth_token = make_token(test_user)
    headers = {"Authorization": f"Bearer {auth_token}"}

    # Invalid extension: .exe
    fake_exe = io.BytesIO(b"MZ executable content")
    res = client.post(
        "/api/career/upload-resume",
        headers=headers,
        files={"file": ("malicious.exe", fake_exe, "application/octet-stream")},
    )
    assert res.status_code == 400
    assert "Unsupported file type" in get_err(res)

    # Invalid extension in Coach endpoint: .zip
    fake_zip = io.BytesIO(b"PK zip content")
    res_coach = client.post(
        "/api/coach/resume",
        headers=headers,
        files={"file": ("archive.zip", fake_zip, "application/zip")},
    )
    assert res_coach.status_code == 400
    assert "Unsupported file type" in get_err(res_coach)


def test_resume_upload_size_limit(client, test_user):
    auth_token = make_token(test_user)
    headers = {"Authorization": f"Bearer {auth_token}"}

    # Generate content larger than 10MB (10MB + 1KB)
    large_size = (10 * 1024 * 1024) + 1024
    large_data = io.BytesIO(b"A" * large_size)

    res = client.post(
        "/api/career/upload-resume",
        headers=headers,
        files={"file": ("large_resume.txt", large_data, "text/plain")},
    )
    assert res.status_code == 400
    assert "10MB" in get_err(res)


def test_shared_resume_career_to_coach_sync(client, test_session, test_user):
    auth_token = make_token(test_user)
    headers = {"Authorization": f"Bearer {auth_token}"}

    # 1. Upload valid resume via Career
    valid_text_resume = b"Software Engineer with 6 years experience in Python, FastAPI, React, and AWS cloud."
    res = client.post(
        "/api/career/upload-resume",
        headers=headers,
        data={"target_role": "Senior Full-Stack Engineer", "target_company": "Acme Corp"},
        files={"file": ("my_resume.txt", io.BytesIO(valid_text_resume), "text/plain")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["resume_filename"] == "my_resume.txt"
    assert "Software Engineer" in data["resume_text"]

    # 2. Verify Career Profile reflects it
    prof_res = client.get("/api/career/profile", headers=headers)
    assert prof_res.status_code == 200
    prof = prof_res.json()
    assert prof["resume_filename"] == "my_resume.txt"
    assert "Software Engineer" in prof["resume_text"]

    # 3. Coach updates resume via /api/coach/resume
    updated_resume = b"Principal Engineer with 10 years experience architecting distributed microservices."
    coach_upload_res = client.post(
        "/api/coach/resume",
        headers=headers,
        files={"file": ("updated_resume.txt", io.BytesIO(updated_resume), "text/plain")},
    )
    assert coach_upload_res.status_code == 200
    assert coach_upload_res.json()["resume_filename"] == "updated_resume.txt"

    # 4. Profile reflects the Coach update (Shared Profile Verification)
    prof_res2 = client.get("/api/career/profile", headers=headers)
    prof2 = prof_res2.json()
    assert prof2["resume_filename"] == "updated_resume.txt"
    assert "Principal Engineer" in prof2["resume_text"]


def test_interview_start_with_use_saved_resume(client, test_session, test_user):
    auth_token = make_token(test_user)
    headers = {"Authorization": f"Bearer {auth_token}"}

    # Seed UserCareerProfile
    prof = UserCareerProfile(
        user_id=test_user.id,
        target_role="Lead Architect",
        target_company="Stripe",
        resume_filename="architect_resume.pdf",
        resume_text="Extensive background in scalable payment infrastructure and distributed idempotency.",
    )
    test_session.add(prof)
    test_session.commit()

    # Start interview with use_saved_resume=True and empty resume_text
    with patch("spark.interview.generate_opening_question") as mock_ai:
        mock_ai.return_value = "Can you walk me through designing an idempotent payment webhook processor?"

        res = client.post(
            "/api/interview/start",
            headers=headers,
            json={
                "target_role": "Lead Architect",
                "target_company": "Stripe",
                "job_description": "Architect high throughput systems",
                "resume_text": "",
                "use_saved_resume": True,
                "round_type": "Technical Deep-Dive",
                "difficulty": "Hard",
            },
        )
        assert res.status_code == 200
        sess_data = res.json()
        assert sess_data["status"] == "active"

        # Verify the AI function received the saved resume text from the profile
        mock_ai.assert_called_once()
        call_kwargs = mock_ai.call_args[1]
        assert "idempotency" in call_kwargs["resume_text"]


def test_user_data_isolation(client, test_session, test_user, second_user):
    # Candidate 1 has a resume
    prof1 = UserCareerProfile(
        user_id=test_user.id,
        target_role="Frontend Engineer",
        resume_filename="candidate1_resume.pdf",
        resume_text="React expert",
    )
    test_session.add(prof1)
    test_session.commit()

    # Candidate 2 checks profile -> should NOT see candidate 1's resume
    token2 = make_token(second_user)
    headers2 = {"Authorization": f"Bearer {token2}"}
    res2 = client.get("/api/career/profile", headers=headers2)
    assert res2.status_code == 200
    assert res2.json()["resume_filename"] == ""
    assert res2.json()["resume_text"] == ""
