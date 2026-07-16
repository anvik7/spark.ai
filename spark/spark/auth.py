"""Email/password auth for the web app. Passwords use PBKDF2-HMAC-SHA256
(stdlib, no native build step); sessions are stateless JWTs. Set JWT_SECRET in
production — a random per-process secret is used if it's unset so dev still works."""
import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from .config import get_settings
from .models import User, get_session

settings = get_settings()
_JWT_SECRET = os.environ.get("JWT_SECRET") or secrets.token_hex(32)
_JWT_ALG = "HS256"
_TOKEN_TTL = 60 * 60 * 24 * 30  # 30 days
_bearer = HTTPBearer(auto_error=True)


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
    email = email.strip().lower()
    user = User(channel="web", external_id=email, email=email,
                name=name or email.split("@")[0],
                hashed_password=hash_password(password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def find_by_email(session: Session, email: str) -> Optional[User]:
    email = email.strip().lower()
    return session.exec(select(User).where(User.email == email)).first()
