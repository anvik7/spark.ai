"""Focused security regression tests for:
- P0-2: CORS lockdown (strict allowlist, no wildcard with credentials)
- P0-3: JWT secret enforcement (production fail-fast, safe dev fallback)
"""

import os
import sys
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from spark.main import app, _get_allowed_origins
from spark.auth import _resolve_jwt_secret

client = TestClient(app)


# ============================================================================
# P0-2: CORS LOCKDOWN TESTS
# ============================================================================

def test_cors_middleware_never_combines_wildcard_with_credentials():
    """Verify that CORSMiddleware does not combine allow_origins=['*'] with allow_credentials=True."""
    cors_middlewares = [m for m in app.user_middleware if "CORSMiddleware" in str(m.cls)]
    assert len(cors_middlewares) > 0, "CORSMiddleware must be present"
    for m in cors_middlewares:
        origins = m.kwargs.get("allow_origins", [])
        creds = m.kwargs.get("allow_credentials", False)
        if "*" in origins:
            assert creds is False, "CRITICAL: allow_origins=['*'] must NEVER be combined with allow_credentials=True"


def test_cors_allowed_production_origin_receives_headers():
    """Verify that legitimate production origins receive proper CORS headers and allow credentials."""
    for origin in [
        "https://sparkdhi.ai",
        "https://www.sparkdhi.ai",
        "https://spark-ai.onrender.com",
        "https://spark-web.onrender.com",
    ]:
        res = client.options(
            "/api/billing/plans",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization,Content-Type",
            },
        )
        assert res.headers.get("access-control-allow-origin") == origin, f"Expected allow-origin for {origin}"
        assert res.headers.get("access-control-allow-credentials") == "true"


def test_cors_allowed_development_origin_receives_headers():
    """Verify that local development origins (localhost/127.0.0.1) are permitted for local work."""
    for origin in ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000"]:
        res = client.options(
            "/api/billing/plans",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        assert res.headers.get("access-control-allow-origin") == origin, f"Expected allow-origin for {origin}"


def test_cors_unapproved_origin_rejected():
    """Verify that unapproved/malicious third-party origins are strictly rejected without CORS headers."""
    for bad_origin in [
        "https://evil.com",
        "https://attacker.site",
        "http://sparkdhi.ai.evil.com",
        "null",
    ]:
        res = client.get("/api/billing/plans", headers={"Origin": bad_origin})
        # Starlette CORS middleware omits Access-Control-Allow-Origin header for unlisted origins
        assert res.headers.get("access-control-allow-origin") != bad_origin, (
            f"Unapproved origin {bad_origin} was reflected in Access-Control-Allow-Origin!"
        )


def test_cors_env_parsing_comma_separated():
    """Verify that ALLOWED_ORIGINS correctly trims whitespace and ignores empty items."""
    old_env = os.environ.get("ALLOWED_ORIGINS")
    try:
        os.environ["ALLOWED_ORIGINS"] = " https://app.example.com , https://test.org , , "
        parsed = _get_allowed_origins()
        assert parsed == ["https://app.example.com", "https://test.org"]
    finally:
        if old_env is None:
            os.environ.pop("ALLOWED_ORIGINS", None)
        else:
            os.environ["ALLOWED_ORIGINS"] = old_env


# ============================================================================
# P0-3: JWT SECRET ENFORCEMENT TESTS
# ============================================================================

def test_jwt_production_missing_secret_raises_runtime_error():
    """Verify that when running in production, a missing JWT_SECRET immediately halts startup."""
    old_env = dict(os.environ)
    try:
        os.environ["ENVIRONMENT"] = "production"
        os.environ["JWT_SECRET"] = ""
        with pytest.raises(RuntimeError) as exc_info:
            _resolve_jwt_secret()
        assert "JWT_SECRET must be configured" in str(exc_info.value)
    finally:
        os.environ.clear()
        os.environ.update(old_env)


def test_jwt_render_missing_secret_raises_runtime_error():
    """Verify that when running on Render (RENDER=true), missing JWT_SECRET halts startup."""
    old_env = dict(os.environ)
    try:
        os.environ.pop("ENVIRONMENT", None)
        os.environ["RENDER"] = "true"
        os.environ["JWT_SECRET"] = "   "
        with pytest.raises(RuntimeError) as exc_info:
            _resolve_jwt_secret()
        assert "JWT_SECRET must be configured" in str(exc_info.value)
    finally:
        os.environ.clear()
        os.environ.update(old_env)


def test_jwt_production_insecure_placeholder_raises_runtime_error():
    """Verify that known placeholder secrets in production are rejected."""
    old_env = dict(os.environ)
    try:
        os.environ["ENVIRONMENT"] = "production"
        for placeholder in ["change-me-in-production", "secret", "jwt-secret", "dev-secret"]:
            os.environ["JWT_SECRET"] = placeholder
            with pytest.raises(RuntimeError) as exc_info:
                _resolve_jwt_secret()
            assert "JWT_SECRET must be configured" in str(exc_info.value)
    finally:
        os.environ.clear()
        os.environ.update(old_env)


def test_jwt_production_valid_secret_succeeds():
    """Verify that a valid non-empty JWT_SECRET succeeds in production."""
    old_env = dict(os.environ)
    try:
        os.environ["ENVIRONMENT"] = "production"
        os.environ["JWT_SECRET"] = "super-strong-random-hex-64char-secret-value-12345"
        val = _resolve_jwt_secret()
        assert val == "super-strong-random-hex-64char-secret-value-12345"
    finally:
        os.environ.clear()
        os.environ.update(old_env)


def test_jwt_development_missing_secret_generates_ephemeral_safely():
    """Verify that local development (non-production) still generates an ephemeral key without crashing."""
    old_env = dict(os.environ)
    try:
        os.environ.pop("ENVIRONMENT", None)
        os.environ.pop("RENDER", None)
        os.environ["JWT_SECRET"] = ""
        val = _resolve_jwt_secret()
        assert isinstance(val, str)
        assert len(val) == 64  # secrets.token_hex(32) -> 64 hex chars
    finally:
        os.environ.clear()
        os.environ.update(old_env)


def test_jwt_error_message_never_leaks_secret_value():
    """Verify that failure messages never expose the configured secret value."""
    old_env = dict(os.environ)
    try:
        os.environ["ENVIRONMENT"] = "production"
        os.environ["JWT_SECRET"] = "secret"
        try:
            _resolve_jwt_secret()
        except RuntimeError as e:
            # Error message should be a generic instruction, not leak secret or details
            assert "JWT_SECRET must be configured with a secure key in production." in str(e)
    finally:
        os.environ.clear()
        os.environ.update(old_env)
