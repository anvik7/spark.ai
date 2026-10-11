"""Email/password auth for the web app. Passwords use PBKDF2-HMAC-SHA256
(stdlib, no native build step); sessions are stateless JWTs. Set JWT_SECRET in
production — a random per-process secret is used if it's unset so dev still works."""
import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from .config import get_settings
from .models import User, PasswordResetToken, get_session

def _resolve_jwt_secret() -> str:
    raw = (os.environ.get("JWT_SECRET") or "").strip()
    env = (os.environ.get("ENVIRONMENT") or os.environ.get("ENV") or os.environ.get("SPARK_ENV") or "").strip().lower()
    is_production = env in ("production", "prod") or bool(os.environ.get("RENDER"))

    if is_production:
        insecure_placeholders = {"change-me-in-production", "secret", "jwt-secret", "dev-secret", "test-secret"}
        if not raw or raw in insecure_placeholders:
            raise RuntimeError("FATAL: JWT_SECRET must be configured with a secure key in production.")
        return raw

    return raw or secrets.token_hex(32)


_JWT_SECRET = _resolve_jwt_secret()
_JWT_ALG = "HS256"
_TOKEN_TTL = 60 * 60 * 24 * 30  # 30 days
_bearer = HTTPBearer(auto_error=True)

# In-memory rate limiting for reset requests: {email: [timestamp, ...]}
_RESET_REQUESTS: dict[str, list[float]] = {}
_MAX_RESET_REQUESTS = 5
_RESET_WINDOW_SECONDS = 900  # 15 minutes


# --- passwords --------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"pbkdf2$200000${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


# --- tokens -----------------------------------------------------------------

def make_token(user: User) -> str:
    now = int(time.time())
    payload = {"sub": str(user.id), "iat": now, "exp": now + _TOKEN_TTL}
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALG)


def _user_id_from_token(token: str) -> int:
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALG])
        return int(payload["sub"])
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")


# --- dependency -------------------------------------------------------------

def current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> User:
    uid = _user_id_from_token(creds.credentials)
    with get_session() as session:
        user = session.get(User, uid)
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")
        session.expunge(user)
        return user


def get_or_create_user(session: Session, email: str, password: str,
                       name: str = "") -> User:
    """Signup: fails loudly with a 409 if the email is already registered,
    instead of letting a DB constraint violation surface as a raw 500."""
    email = email.strip().lower()

    existing = find_by_email(session, email)
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An account with this email already exists. Try logging in instead.",
        )

    preset_id = f"preset-{(sum(ord(c) for c in email) % 12) + 1}"
    user = User(channel="web", external_id=email, email=email,
                name=name or email.split("@")[0],
                avatar_url=preset_id,
                hashed_password=hash_password(password))
    session.add(user)
    try:
        session.commit()
    except Exception:
        # belt-and-suspenders: catches a race condition where two signups
        # for the same email land between the check above and this commit
        session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An account with this email already exists. Try logging in instead.",
        )
    session.refresh(user)
    return user


def find_by_email(session: Session, email: str) -> Optional[User]:
    email = email.strip().lower()
    return session.exec(select(User).where(User.email == email)).first()


# --- Password Reset Tokens --------------------------------------------------

def check_reset_rate_limit(email: str) -> bool:
    """Return True if allowed, False if rate limited (max 5 requests per 15 min)."""
    now = time.time()
    clean_email = email.strip().lower()
    timestamps = _RESET_REQUESTS.get(clean_email, [])
    # Keep only timestamps within window
    timestamps = [ts for ts in timestamps if now - ts < _RESET_WINDOW_SECONDS]
    if len(timestamps) >= _MAX_RESET_REQUESTS:
        _RESET_REQUESTS[clean_email] = timestamps
        return False
    timestamps.append(now)
    _RESET_REQUESTS[clean_email] = timestamps
    return True


def hash_token(token: str) -> str:
    """Return SHA-256 hash of reset token for safe DB storage."""
    return hashlib.sha256(token.strip().encode("utf-8")).hexdigest()


def create_password_reset_token(session: Session, user: User, ttl_minutes: int = 30) -> str:
    """Generate a cryptographically secure token, store its SHA-256 hash, and return the raw token."""
    raw_token = secrets.token_urlsafe(32)
    t_hash = hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)

    # Invalidate any existing unused reset tokens for this user
    existing_tokens = session.exec(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used == False)
    ).all()
    for tok in existing_tokens:
        tok.used = True
        session.add(tok)

    # Create new reset token record
    reset_record = PasswordResetToken(
        user_id=user.id,
        token_hash=t_hash,
        expires_at=expires_at,
        used=False,
    )
    session.add(reset_record)
    session.commit()
    return raw_token


def validate_reset_token(session: Session, raw_token: str) -> Optional[Tuple[User, PasswordResetToken]]:
    """Validate token hash and expiry without consuming it. Returns (User, PasswordResetToken) if valid."""
    if not raw_token or not raw_token.strip():
        return None

    t_hash = hash_token(raw_token)
    now = datetime.now(timezone.utc)

    record = session.exec(
        select(PasswordResetToken)
        .where(PasswordResetToken.token_hash == t_hash, PasswordResetToken.used == False)
    ).first()

    if not record:
        return None

    # Handle timezone-naive vs aware
    exp = record.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if exp < now:
        return None

    user = session.get(User, record.user_id)
    if not user:
        return None

    return user, record


def verify_and_consume_reset_token(session: Session, raw_token: str, new_password: str) -> User:
    """Verify reset token, validate new password, update password hash, and consume token."""
    res = validate_reset_token(session, raw_token)
    if not res:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Invalid, expired, or already used password reset link. Please request a new one.",
        )

    user, record = res

    if len(new_password) < 8:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Password must be at least 8 characters long.",
        )

    # Update password
    user.hashed_password = hash_password(new_password)
    session.add(user)

    # Invalidate token
    record.used = True
    session.add(record)

    session.commit()
    session.refresh(user)
    return user


# --- Founder Authorization --------------------------------------------------

def is_founder(user: Optional[User]) -> bool:
    """Return True if the user has the 'founder' role in DB or is in SPARK_FOUNDER_EMAILS."""
    if not user:
        return False
    if getattr(user, "role", None) == "founder":
        return True
    cfg_emails = get_settings().founder_emails
    if cfg_emails and user.email:
        founder_list = [e.strip().lower() for e in cfg_emails.split(",") if e.strip()]
        if user.email.strip().lower() in founder_list:
            return True
    return False


def require_founder(user: User = Depends(current_user)) -> User:
    """FastAPI route dependency ensuring current user holds Founder privileges."""
    if not is_founder(user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Access restricted to SparkDhi Founder account.",
        )
    return user