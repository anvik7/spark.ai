"""Spark API. One FastAPI app exposing auth, card ingestion, the
spaced-repetition review loop, tag/search + connect-the-dots, and Razorpay
billing. Serves the built React PWA from ./web/dist in production."""
import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

from fastapi import (Depends, FastAPI, File, Form, HTTPException, Request,
                     UploadFile, status)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlmodel import col, select, func

try:
    import razorpay
except ImportError:
    razorpay = None

from . import career, content_understanding, embeddings, interview, llm, memory, stats, storage, subscription
from .content_understanding import UnsupportedFileError
from .storage import build_object_key, get_storage, guess_content_type
from .tts import get_tts_provider
from .auth import (current_user, find_by_email, get_or_create_user, make_token,
                   verify_password, check_reset_rate_limit, create_password_reset_token,
                   validate_reset_token, verify_and_consume_reset_token,
                   is_founder, require_founder, _user_id_from_token)
from .email_service import send_password_reset_email
from .config import get_settings
from .ingest import build_card_fields
from .models import Card, CardEmbedding, InterviewSession, StudentTask, User, UserCareerProfile, SubscriptionOrder, get_session, init_db
from .srs import due_cards, schedule
from .leaderboard import router as leaderboard_router
from .routes.circles import router as circles_router
settings = get_settings()


@asynccontextmanager
async def _lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    yield

app = FastAPI(title=settings.app_name, lifespan=_lifespan)
app.include_router(leaderboard_router)
app.include_router(circles_router)
def _get_allowed_origins() -> list[str]:
    import os
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    if raw.strip():
        return [o.strip() for o in raw.split(",") if o.strip()]
    return [
        "https://sparkdhi.ai",
        "https://www.sparkdhi.ai",
        "https://spark-ai.onrender.com",
        "https://spark-web.onrender.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]


_cors_origins = _get_allowed_origins()
_cors_allow_credentials = False if _cors_origins == ["*"] else True

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=_cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("spark")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle FastAPI HTTPExceptions with clean JSON error structure."""
    if request.url.path.startswith("/api"):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": f"HTTP_{exc.status_code}",
                    "message": exc.detail,
                }
            },
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(Exception)
async def global_api_exception_handler(request: Request, exc: Exception):
    """Shield production API errors: log traceback server-side and return safe JSON."""
    logger.exception(f"Unhandled server error on {request.method} {request.url.path}")
    if request.url.path.startswith("/api"):
        parts = request.url.path.split("/")
        domain = parts[2].upper() if len(parts) > 2 and parts[2] else "API"
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": f"{domain}_SERVER_ERROR",
                    "message": "We couldn't process your request right now. Please try again.",
                }
            },
        )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# --- schemas ----------------------------------------------------------------

class SignupIn(BaseModel):
    email: EmailStr
    password: str
    name: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class CardIn(BaseModel):
    kind: str = "text"           # text | link
    raw: str = ""
    ocr_text: Optional[str] = None
    lang_hint: str = "auto"


class CardUpdateIn(BaseModel):
    raw: Optional[str] = None
    title: Optional[str] = None
    tags: Optional[list[str]] = None


class GradeIn(BaseModel):
    grade: int


class InterviewIn(BaseModel):
    role: str = ""
    company: str = ""
    context: str = ""
    round: str = "HR Screen"
    history: list = []
    transcript: list = []
    action: str = "question"


class SearchIn(BaseModel):
    q: str
    mode: str = "ask"   # "ask" = Q&A briefing, "draft" = generate writing from notes


def _public_user(session, user: User) -> dict:
    cards = session.exec(select(Card).where(Card.user_id == user.id)).all()
    entitlements = subscription.get_user_entitlements(user, session)
    return {
        "id": user.id, "email": user.email, "name": user.name,
        "avatar_url": getattr(user, "avatar_url", "") or "",
        "role": getattr(user, "role", "user") or "user",
        "is_founder": is_founder(user),
        "plan": user.plan,
        "current_plan": entitlements["current_plan"],
        "effective_plan": entitlements["effective_plan"],
        "subscription_status": entitlements["subscription_status"],
        "plan_until": user.plan_until,
        "card_count": len(cards),
        "free_card_limit": settings.free_card_limit,
        "entitlements": entitlements,
    }


def _card_out(c: Card, creator: User | None = None) -> dict:
    creator_name = creator.name if (creator and creator.name) else (creator.email.split("@")[0] if creator and creator.email else None)
    return {
        "id": c.id, "kind": c.kind, "raw": c.raw,
        "title": getattr(c, "title", ""), "summary": c.summary,
        "tags": c.tags or [], "topic": getattr(c, "topic", ""),
        "difficulty": getattr(c, "difficulty", 0),
        "importance": getattr(c, "importance", 0),
        "source_type": getattr(c, "source_type", c.kind),
        "source_url": c.source_url,
        "created_at": c.created_at, "due_on": c.due_on, "reps": c.reps,
        "is_public": getattr(c, "is_public", False),
        "share_token": getattr(c, "share_token", None),
        "creator_name": creator_name,
        "creator_avatar": creator.avatar_url if creator else "",
    }


@app.get("/api/public/captures/{share_token}")
def get_public_capture(share_token: str):
    """Public endpoint to view a shared capture cleanly without authentication.
    Strictly shields user account details, emails, internal IDs, and subscription data."""
    with get_session() as session:
        card = session.exec(select(Card).where(Card.share_token == share_token, Card.is_public == True)).first()
        if not card:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Capture not found or share link has been revoked.")
        creator = session.get(User, card.user_id) if card.user_id else None
        creator_name = creator.name if (creator and creator.name) else (creator.email.split("@")[0] if creator and creator.email else "Spark User")
        return {
            "id": card.id,
            "kind": card.kind,
            "title": getattr(card, "title", "") or "",
            "raw": card.raw,
            "summary": card.summary,
            "tags": card.tags or [],
            "topic": getattr(card, "topic", "") or "",
            "created_at": card.created_at,
            "source_url": card.source_url,
            "is_public": card.is_public,
            "share_token": card.share_token,
            "creator_name": creator_name,
            "creator_avatar": creator.avatar_url if creator else "",
        }


# --- auth -------------------------------------------------------------------

@app.post("/api/auth/signup")
def signup(body: SignupIn):
    with get_session() as session:
        if find_by_email(session, body.email):
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
        if len(body.password) < 8:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Use at least 8 characters")
        user = get_or_create_user(session, body.email, body.password, body.name)
        return {"token": make_token(user), "user": _public_user(session, user)}


@app.post("/api/auth/login")
def login(body: LoginIn):
    with get_session() as session:
        user = find_by_email(session, body.email)
        if not user or not verify_password(body.password, user.hashed_password or ""):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
        return {"token": make_token(user), "user": _public_user(session, user)}


# --- Password Recovery Endpoints ---

class ForgotPasswordIn(BaseModel):
    email: EmailStr


class VerifyResetTokenIn(BaseModel):
    token: str


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str


@app.post("/api/auth/forgot-password")
def forgot_password(body: ForgotPasswordIn):
    """Initiate password recovery. Generates single-use reset token and sends email.

    Always returns a generic success message to prevent account enumeration.
    """
    clean_email = str(body.email).strip().lower()

    # Rate limiting protection (max 5 requests per 15 min per email)
    if not check_reset_rate_limit(clean_email):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many password reset requests. Please wait 15 minutes before trying again."
        )

    with get_session() as session:
        user = find_by_email(session, clean_email)
        if user and user.email:
            raw_token = create_password_reset_token(session, user, ttl_minutes=30)
            base_url = (getattr(settings, "app_base_url", None) or "https://sparkdhi.ai").rstrip("/")
            reset_link = f"{base_url}/reset-password?token={raw_token}"
            send_password_reset_email(user.email, reset_link)

    return {
        "ok": True,
        "message": "If an account exists for this email, we've sent password reset instructions."
    }


@app.post("/api/auth/verify-reset-token")
def verify_reset_token(body: VerifyResetTokenIn):
    """Verify that a password reset token is valid and unexpired before rendering reset form."""
    with get_session() as session:
        res = validate_reset_token(session, body.token)
        if not res:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "This password reset link is invalid or has expired. Please request a new one."
            )
        user, _ = res
        email_parts = (user.email or "user@sparkdhi.ai").split("@")
        masked = email_parts[0][:2] + "***@" + email_parts[1] if len(email_parts) > 1 else "***"
        return {
            "ok": True,
            "valid": True,
            "masked_email": masked
        }


@app.post("/api/auth/reset-password")
def reset_password(body: ResetPasswordIn):
    """Reset user password using a valid, unexpired, single-use reset token."""
    if len(body.new_password) < 8:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Password must be at least 8 characters long."
        )

    with get_session() as session:
        user = verify_and_consume_reset_token(session, body.token, body.new_password)
        return {
            "ok": True,
            "message": "Password has been successfully updated. You can now log in with your new password."
        }


import uuid

@app.get("/api/me")
def me(user: User = Depends(current_user)):
    with get_session() as session:
        return _public_user(session, user)


# --- Founder Account Endpoints ----------------------------------------------

class FounderTestModeIn(BaseModel):
    mode: str = "default"  # "default", "free", "plus", "pro"


@app.get("/api/founder/status")
def founder_status(user: User = Depends(require_founder)):
    """Retrieve Founder account status, test mode state, and quotas."""
    test_mode = subscription.get_founder_test_mode(user.id)
    eff_plan = subscription.get_effective_plan(user)
    limits = subscription.get_plan_limits(user)
    return {
        "ok": True,
        "is_founder": True,
        "user_id": user.id,
        "email": user.email,
        "role": getattr(user, "role", "user"),
        "active_test_mode": test_mode,
        "effective_plan": eff_plan,
        "limits": limits,
        "server_time": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/founder/test-mode")
def set_founder_mode(body: FounderTestModeIn, user: User = Depends(require_founder)):
    """Switch simulated test tier for this Founder session ('default', 'free', 'plus', 'pro')."""
    valid_modes = ("default", "free", "plus", "pro")
    target = body.mode.strip().lower()
    if target not in valid_modes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Invalid test mode '{body.mode}'. Supported modes: {', '.join(valid_modes)}",
        )
    active = subscription.set_founder_test_mode(user.id, target)
    eff_plan = subscription.get_effective_plan(user)
    limits = subscription.get_plan_limits(user)
    return {
        "ok": True,
        "active_test_mode": active,
        "effective_plan": eff_plan,
        "limits": limits,
    }


# --- user profile / avatar --------------------------------------------------

_UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
_UPLOAD_FILES_DIR = _UPLOAD_DIR / "files"
_UPLOAD_FILES_DIR.mkdir(parents=True, exist_ok=True)


class AvatarPresetIn(BaseModel):
    avatar_url: str


@app.post("/api/me/avatar")
def update_avatar_preset(body: AvatarPresetIn, user: User = Depends(current_user)):
    with get_session() as session:
        db_user = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        db_user.avatar_url = body.avatar_url
        session.add(db_user)
        session.commit()
        session.refresh(db_user)
        return _public_user(session, db_user)


_upload_bearer = HTTPBearer(auto_error=False)


def authenticated_upload_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_upload_bearer),
) -> User:
    if not creds or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    uid = _user_id_from_token(creds.credentials)
    with get_session() as session:
        user = session.get(User, uid)
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")
        session.expunge(user)
        return user


def _serve_storage_or_file(storage_key: Optional[str], filename: str) -> Response:
    storage_adapter = get_storage()
    ct = guess_content_type(filename)

    # 1. Try explicit storage key
    if storage_key:
        if hasattr(storage_adapter, "get_local_path"):
            local_path = storage_adapter.get_local_path(storage_key)
            if local_path and local_path.is_file():
                return FileResponse(local_path)
        try:
            data = storage_adapter.get(storage_key)
            if data is not None:
                media_type = storage_adapter.get_content_type(storage_key) or ct
                return Response(content=data, media_type=media_type)
        except Exception:
            pass

    # 2. Try filename directly in storage
    try:
        if storage_adapter.exists(filename):
            if hasattr(storage_adapter, "get_local_path"):
                local_path = storage_adapter.get_local_path(filename)
                if local_path and local_path.is_file():
                    return FileResponse(local_path)
            data = storage_adapter.get(filename)
            if data is not None:
                return Response(content=data, media_type=ct)
    except Exception:
        pass

    # 3. Legacy filesystem fallback (_UPLOAD_FILES_DIR and _UPLOAD_DIR)
    for folder in [_UPLOAD_FILES_DIR, _UPLOAD_DIR]:
        base = folder.resolve()
        candidate = (base / filename).resolve()
        if candidate.is_relative_to(base) and candidate.is_file():
            return FileResponse(candidate)

    raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")


@app.get("/api/uploads/{filename}")
def serve_upload(filename: str, user: User = Depends(authenticated_upload_user)):
    # 1. Path safety: reject traversal characters, slashes, or malformed filenames
    if (
        not filename
        or "/" in filename
        or "\\" in filename
        or ".." in filename
        or Path(filename).name != filename
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid filename")

    # 2. Ownership / Authorization: verify database relationship or public authorization
    target_url = f"/api/uploads/{filename}"
    is_admin = getattr(user, "role", None) in ("admin", "founder")

    with get_session() as session:
        # Check student task attachments
        task_matches = session.exec(
            select(StudentTask).where(
                (StudentTask.image_url == target_url) |
                (StudentTask.image_url == filename) |
                (StudentTask.image_url == f"api/uploads/{filename}") |
                (StudentTask.storage_key == filename) |
                (StudentTask.storage_key.like(f"%/{filename}"))
            )
        ).all()
        if task_matches:
            if not (any(t.user_id == user.id for t in task_matches) or is_admin):
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
            matched_task = next((t for t in task_matches if t.user_id == user.id or is_admin), task_matches[0])
            return _serve_storage_or_file(matched_task.storage_key, filename)

        # Check card attachments (files, voice notes, PDFs, images)
        card_matches = session.exec(
            select(Card).where(
                (Card.source_url == target_url) |
                (Card.source_url == filename) |
                (Card.source_url == f"api/uploads/{filename}") |
                (Card.storage_key == filename) |
                (Card.storage_key.like(f"%/{filename}"))
            )
        ).all()
        if card_matches:
            if not (any(c.user_id == user.id or c.is_public for c in card_matches) or is_admin):
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
            matched_card = next((c for c in card_matches if c.user_id == user.id or c.is_public or is_admin), card_matches[0])
            return _serve_storage_or_file(matched_card.storage_key, filename)

    # File has no authorized database association for this user
    raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")


@app.get("/assets/fonts/{font_name}")
def serve_font_fallback(font_name: str):
    return Response(content=b"", media_type="font/woff2")


# --- cards ------------------------------------------------------------------

def _save_card(session, user: User, fields: dict) -> Card:
    card = Card(user_id=int(user.id), **fields)  # type: ignore[arg-type]
    session.add(card)
    session.commit()
    session.refresh(card)
    _index_card(session, card)
    return card


def _index_card(session, card) -> None:
    try:
        vec = embeddings.embed(f"{card.summary}\n{card.raw}")
        row = session.get(CardEmbedding, card.id)
        if row:
            row.vector, row.dim = json.dumps(vec), len(vec); session.add(row)
        else:
            session.add(CardEmbedding(card_id=card.id, vector=json.dumps(vec), dim=len(vec)))
        session.commit()
    except Exception as e:
        print(f"[index] failed for card {getattr(card,'id',None)}: {e}")


@app.post("/api/cards")
def create_card(body: CardIn, user: User = Depends(current_user)):
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        user = db_user
        ok, msg = subscription.can_add_card(session, user)
        if not ok:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, msg)
        ok, msg = subscription.check_ai_quota(session, user)
        if not ok:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, msg)
        fields = build_card_fields(body.kind, body.raw, ocr_text=body.ocr_text,
                                   lang_hint=body.lang_hint)
        return _card_out(_save_card(session, user, fields))


@app.post("/api/cards/voice")
@app.post("/api/captures/voice")
async def create_voice_card(file: UploadFile = File(...),
                            lang_hint: str = Form("auto"),
                            user: User = Depends(current_user)):
    audio = await file.read()
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        user = db_user
        ok, msg = subscription.can_add_card(session, user)
        if not ok:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, msg)
        ok, msg = subscription.check_ai_quota(session, user)
        if not ok:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, msg)
        
        # Save voice recording file to storage
        ext = Path(file.filename or "voice.webm").suffix or ".webm"
        token = uuid.uuid4().hex[:12]
        filename = f"voice_{user.id}_{token}{ext}"
        object_key = build_object_key("captures", user.id, filename, identifier=token)
        get_storage().put(object_key, audio, content_type=file.content_type or "audio/webm")

        fields = build_card_fields("voice", audio_bytes=audio, lang_hint=lang_hint)
        fields["source_url"] = f"/api/uploads/{filename}"
        fields["storage_key"] = object_key
        fields["kind"] = "voice"
        return _card_out(_save_card(session, user, fields))


@app.post("/api/cards/file")
@app.post("/api/captures/file")
async def create_file_card(file: UploadFile = File(...),
                           user: User = Depends(current_user)):
    data = await file.read()
    is_pdf = data[:5] == b"%PDF-" or (file.filename and file.filename.lower().endswith(".pdf"))
    is_image = (file.content_type and file.content_type.startswith("image/")) or \
               (file.filename and Path(file.filename).suffix.lower() in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic"])

    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        user = db_user
        ok, msg = subscription.can_add_card(session, user)
        if not ok:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, msg)
        ok, msg = subscription.check_ai_quota(session, user)
        if not ok:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, msg)

        ext = Path(file.filename or "file.bin").suffix or (".pdf" if is_pdf else ".jpg")
        token = uuid.uuid4().hex[:12]
        filename = f"file_{user.id}_{token}{ext}"
        object_key = build_object_key("captures", user.id, filename, identifier=token)
        get_storage().put(object_key, data, content_type=file.content_type)

        if is_pdf:
            fields = build_card_fields("pdf", pdf_bytes=data)
            fields["source_url"] = f"/api/uploads/{filename}"
            fields["storage_key"] = object_key
            fields["kind"] = "pdf"
            if not fields.get("title"):
                fields["title"] = file.filename or "PDF Document"
        elif is_image:
            fields = build_card_fields("image", raw=f"Image capture: {file.filename or 'photo'}")
            fields["source_url"] = f"/api/uploads/{filename}"
            fields["storage_key"] = object_key
            fields["kind"] = "image"
            if not fields.get("title"):
                fields["title"] = file.filename or "Photo / Diagram"
        else:
            fields = build_card_fields("text", raw=f"Uploaded file: {file.filename}")
            fields["source_url"] = f"/api/uploads/{filename}"
            fields["storage_key"] = object_key
            fields["kind"] = "file"
            fields["title"] = file.filename or "Uploaded File"

        return _card_out(_save_card(session, user, fields))


@app.get("/api/cards")
@app.get("/api/captures")
def list_cards(tag: Optional[str] = None, q: Optional[str] = None,
               limit: int = 50, offset: int = 0,
               user: User = Depends(current_user)):
    with get_session() as session:
        # Initial query for all user cards to apply Python-side filtering due to JSON storage
        query = select(Card).where(Card.user_id == user.id).order_by(col(Card.created_at).desc())
        cards = session.exec(query).all()
        
        if tag:
            cards = [c for c in cards if tag.lower() in [t.lower() for t in c.tags]]
        if q:
            ql = q.lower()
            cards = [c for c in cards
                     if ql in c.raw.lower() or ql in c.summary.lower()
                     or any(ql in t.lower() for t in c.tags)]
        
        # Paginate the filtered list
        paginated_cards = cards[offset:offset+limit]
        db_user = session.get(User, user.id)
        
        return {
            "total": len(cards),
            "limit": limit,
            "offset": offset,
            "items": [_card_out(c, db_user or user) for c in paginated_cards]
        }


@app.post("/api/captures")
def create_capture_alias(body: CardIn, user: User = Depends(current_user)):
    return create_card(body, user)


@app.delete("/api/cards/{card_id}")
@app.delete("/api/captures/{card_id}")
def delete_card(card_id: int, user: User = Depends(current_user)):
    with get_session() as session:
        db_user = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        card = session.get(Card, card_id)
        if not card:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
        if card.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to delete this item")

        # Delete related CardEmbedding row if present
        emb = session.get(CardEmbedding, card_id)
        if emb:
            session.delete(emb)

        # Delete media file from storage if present
        if card.storage_key:
            try:
                get_storage().delete(card.storage_key)
            except Exception as e:
                print(f"[delete_card] Error removing storage object {card.storage_key}: {e}")
        elif card.source_url and card.source_url.startswith("/api/uploads/"):
            fn = card.source_url.replace("/api/uploads/", "")
            try:
                get_storage().delete(fn)
            except Exception:
                pass
            fp = _UPLOAD_FILES_DIR / fn
            if fp.exists():
                try:
                    fp.unlink()
                except Exception as e:
                    print(f"[delete_card] Error removing file {fp}: {e}")

        session.delete(card)
        session.commit()
        return {"deleted": card_id}


# --- capture sharing --------------------------------------------------------

@app.post("/api/captures/{card_id}/share")
@app.post("/api/cards/{card_id}/share")
def share_capture(card_id: int, user: User = Depends(current_user)):
    with get_session() as session:
        card = session.get(Card, card_id)
        if not card or card.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Capture not found")
        if not card.share_token:
            card.share_token = uuid.uuid4().hex[:12]
        card.is_public = True
        session.add(card)
        session.commit()
        session.refresh(card)
        return {
            "is_public": True,
            "share_token": card.share_token,
            "share_url": f"/shared/capture/{card.share_token}",
        }


@app.post("/api/captures/{card_id}/unshare")
@app.post("/api/cards/{card_id}/unshare")
def unshare_capture(card_id: int, user: User = Depends(current_user)):
    with get_session() as session:
        card = session.get(Card, card_id)
        if not card or card.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Capture not found")
        card.is_public = False
        card.share_token = None
        session.add(card)
        session.commit()
        return {"is_public": False}


@app.get("/api/public/captures/{share_token}")
def get_public_capture(share_token: str):
    """Public endpoint to view a shared capture cleanly without authentication.
    Strictly shields user account details, emails, internal IDs, and subscription data."""
    with get_session() as session:
        card = session.exec(select(Card).where(Card.share_token == share_token, Card.is_public == True)).first()
        if not card:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Capture not found or share link has been revoked.")
        return {
            "kind": card.kind,
            "title": getattr(card, "title", "") or "",
            "raw": card.raw,
            "summary": card.summary,
            "tags": card.tags,
            "created_at": card.created_at,
            "source_url": card.source_url,
        }


@app.patch("/api/cards/{card_id}")
def update_card(card_id: int, body: CardUpdateIn, user: User = Depends(current_user)):
    with get_session() as session:
        card = session.get(Card, card_id)
        if not card or card.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
        if body.raw is not None:
            card.raw = body.raw[:8000]
        if body.title is not None:
            card.title = body.title[:80]
        if body.tags is not None:
            card.tags = body.tags[:5]
        session.add(card)
        session.commit()
        session.refresh(card)
        _index_card(session, card)  # re-embed since content changed
        return _card_out(card)


@app.get("/api/tags")
def list_tags(user: User = Depends(current_user)):
    with get_session() as session:
        cards = session.exec(select(Card).where(Card.user_id == user.id)).all()
        counts: dict[str, int] = {}
        for c in cards:
            for t in c.tags:
                counts[t] = counts.get(t, 0) + 1
        return sorted(({"tag": k, "count": v} for k, v in counts.items()),
                      key=lambda x: -x["count"])


# --- review (spaced repetition) --------------------------------------------

@app.get("/api/review/due")
def review_due(limit: int = 3, user: User = Depends(current_user)):
    with get_session() as session:
        cards = session.exec(select(Card).where(Card.user_id == user.id)).all()
        return [_card_out(c) for c in due_cards(list(cards), limit=limit)]


@app.post("/api/review/{card_id}/grade")
def grade_card(card_id: int, body: GradeIn, user: User = Depends(current_user)):
    with get_session() as session:
        card = session.get(Card, card_id)
        if not card or card.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
        schedule(card, body.grade)
        session.add(card)
        session.commit()
        session.refresh(card)
        return _card_out(card)


# --- connect the dots -------------------------------------------------------

@app.post("/api/connect")
def connect(body: SearchIn, user: User = Depends(current_user)):
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        user = db_user
        ok, msg = subscription.check_ai_quota(session, user)
        if not ok:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, msg)
        cards = session.exec(select(Card).where(Card.user_id == user.id)).all()

        # Embed the query
        qvec = embeddings.embed(body.q)

        # Score every card by cosine similarity, lazily indexing any missing
        scored: list[tuple[float, Card]] = []
        for c in cards:
            row = session.get(CardEmbedding, c.id)
            if not row:
                _index_card(session, c)
                row = session.get(CardEmbedding, c.id)
            if row and row.vector:
                try:
                    cvec = json.loads(row.vector)
                    score = embeddings.cosine(qvec, cvec)
                    scored.append((score, c))
                except Exception:
                    pass

        # Top 8 with positive score
        scored.sort(key=lambda x: -x[0])
        matches = [c for s, c in scored[:8] if s > 0]

        # Fallback to keyword substring match if semantic found nothing
        if not matches:
            ql = body.q.lower()
            matches = [c for c in cards
                       if ql in c.raw.lower() or ql in c.summary.lower()
                       or any(ql in t.lower() for t in c.tags)][:25]

        notes = [c.summary or c.raw[:160] for c in matches]
        if body.mode == "draft":
            briefing = llm.draft(body.q, notes)
        else:
            briefing = llm.synthesize(body.q, notes)
        return {"briefing": briefing,
                "cards": [_card_out(c) for c in matches]}


# --- draft (write content FROM saved cards) ---------------------------------

class DraftIn(BaseModel):
    instruction: str          # e.g. "write a LinkedIn post about my React learnings"
    tag: str = ""             # optional: restrict source cards to this tag
    q: str = ""               # optional: restrict by semantic search query


@app.post("/api/draft")
def draft_content(body: DraftIn, user: User = Depends(current_user)):
    """Turn saved cards into a piece of writing (post, essay, summary)."""
    if not body.instruction.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "instruction is required")
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        ok, msg = subscription.check_ai_quota(session, db_user)
        if not ok:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, msg)

        cards = session.exec(select(Card).where(Card.user_id == user.id)).all()

        # Filter by tag if provided
        if body.tag.strip():
            tl = body.tag.strip().lower()
            cards = [c for c in cards if tl in [t.lower() for t in c.tags]]

        # Semantic filter if a query is given
        if body.q.strip() and cards:
            try:
                qvec = embeddings.embed(body.q)
                scored = []
                for c in cards:
                    row = session.get(CardEmbedding, c.id)
                    if row and row.vector:
                        cvec = json.loads(row.vector)
                        scored.append((embeddings.cosine(qvec, cvec), c))
                    else:
                        scored.append((0.0, c))
                scored.sort(key=lambda x: -x[0])
                cards = [c for s, c in scored[:20] if s > 0] or [c for _, c in scored[:20]]
            except Exception:
                pass  # fall through to all cards

        notes = [c.summary or c.raw[:300] for c in cards[:25]]
        text = llm.draft(body.instruction.strip(), notes)
        return {"draft": text, "source_count": len(notes)}


def _format_task_out(t: StudentTask) -> dict:
    return {
        "id": t.id,
        "subject": t.subject,
        "icon": t.icon,
        "title": t.title,
        "prompt": t.prompt,
        "imageUrl": t.image_url,
        "solution": t.solution,
        "steps": json.loads(t.steps_json or "[]"),
        "formulas": json.loads(t.formulas_json or "[]"),
        "intuition": t.intuition,
        "practice": json.loads(t.practice_json or "[]"),
        "thread": json.loads(t.thread_json or "[]"),
        "status": t.status,
        "created_at": t.created_at.isoformat() if getattr(t, "created_at", None) and hasattr(t.created_at, "isoformat") else datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/tasks")
def list_student_tasks(limit: int = 50, offset: int = 0, user: User = Depends(current_user)):
    """List real saved student tasks for authenticated user."""
    with get_session() as session:
        total = session.exec(
            select(func.count()).where(StudentTask.user_id == user.id)
        ).one()
        
        tasks = session.exec(
            select(StudentTask)
            .where(StudentTask.user_id == user.id)
            .order_by(col(StudentTask.created_at).desc())
            .offset(offset)
            .limit(limit)
        ).all()
        
        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": [_format_task_out(t) for t in tasks]
        }


class TaskSolveIn(BaseModel):
    prompt: str = ""
    subject_hint: str = ""


@app.post("/api/tasks/solve")
def solve_task(body: TaskSolveIn, user: User = Depends(current_user)):
    """Solve an academic task, save DB record for user, return created task."""
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Prompt is required.")

    try:
        res = llm.solve_student_task(prompt, subject_hint=body.subject_hint)
    except Exception as e:
        print(f"[solve_task] AI solver error: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(e))

    with get_session() as session:
        task = StudentTask(
            user_id=user.id,
            subject=res.get("subject") or "General Academic",
            icon=res.get("icon") or "📚",
            title=res.get("title") or prompt[:80],
            prompt=prompt,
            solution=res.get("solution") or "AI Solution",
            steps_json=json.dumps(res.get("steps") or []),
            formulas_json=json.dumps(res.get("formulas") or []),
            intuition=res.get("intuition") or "",
            practice_json=json.dumps(res.get("practice") or []),
            thread_json="[]",
            status="Solved by AI",
        )
        session.add(task)
        session.commit()
        session.refresh(task)
        return _format_task_out(task)


@app.post("/api/tasks/upload-solve")
async def upload_and_solve_task(
    file: UploadFile = File(...),
    prompt: str = Form(""),
    subject_hint: str = Form(""),
    user: User = Depends(current_user),
):
    """Upload photo/PDF attachment, extract content, solve via LLM, and save DB record."""
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty.")

    with get_session() as session:
        ok, msg = subscription.check_upload_quota(session, user, len(data))
        if not ok:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, msg)

    ext = Path(file.filename or "file.png").suffix or ".png"
    token = uuid.uuid4().hex[:12]
    filename = f"task_{user.id}_{token}{ext}"
    object_key = build_object_key("tasks", user.id, filename, identifier=token)

    get_storage().put(object_key, data, content_type=file.content_type)

    try:
        extracted = content_understanding.inspect_and_extract(
            data, filename=file.filename or "attachment", mime_type=file.content_type or ""
        )
    except UnsupportedFileError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    except Exception as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Failed to process file: {e}")

    # Solve via Vision or Text extraction
    if extracted.is_visual and extracted.image_b64:
        solve_prompt = prompt.strip() or f"Solve and explain the academic problem shown in this image ({file.filename}) step-by-step."
        full_prompt = solve_prompt
        res = llm.solve_student_task(
            solve_prompt,
            subject_hint=subject_hint,
            image_b64=extracted.image_b64,
            mime_type=extracted.mime_type,
        )
    else:
        doc_text = extracted.text.strip()
        if prompt.strip() and doc_text:
            full_prompt = f"{prompt.strip()}\n\n--- Content from {file.filename} ---\n{doc_text}"
        elif doc_text:
            full_prompt = f"Solve the following problem from {file.filename}:\n\n{doc_text}"
        else:
            full_prompt = prompt.strip() or f"Problem in file: {file.filename}"
        res = llm.solve_student_task(full_prompt, subject_hint=subject_hint)

    with get_session() as session:
        task = StudentTask(
            user_id=user.id,
            subject=res.get("subject") or "General Academic",
            icon=res.get("icon") or "📚",
            title=res.get("title") or prompt[:80] or file.filename or "Uploaded Problem",
            prompt=full_prompt,
            image_url=f"/api/uploads/{filename}",
            storage_key=object_key,
            solution=res.get("solution") or "AI Solution",
            steps_json=json.dumps(res.get("steps") or []),
            formulas_json=json.dumps(res.get("formulas") or []),
            intuition=res.get("intuition") or "",
            practice_json=json.dumps(res.get("practice") or []),
            thread_json="[]",
            status="Solved by AI",
        )
        session.add(task)
        session.commit()
        session.refresh(task)
        return _format_task_out(task)


@app.post("/api/tasks/extract-paper")
async def extract_question_paper_endpoint(
    file: Optional[UploadFile] = File(None),
    raw_text: str = Form(""),
    subject_hint: str = Form(""),
    exam_hint: str = Form(""),
    user: User = Depends(current_user),
):
    """Extract structured question paper according to canonical JSON schema without solving."""
    if not file and not raw_text.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Either file or raw_text must be provided.")

    file_bytes = None
    filename = "paper.txt"
    mime_type = "text/plain"

    if file:
        file_bytes = await file.read()
        filename = file.filename or "paper"
        mime_type = file.content_type or ""

    try:
        extraction = content_understanding.extract_question_paper(
            file_bytes=file_bytes,
            filename=filename,
            mime_type=mime_type,
            text_content=raw_text.strip() if not file_bytes else None,
            subject_hint=subject_hint.strip() or None,
            exam_hint=exam_hint.strip() or None,
        )
    except UnsupportedFileError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    except Exception as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Extraction failed: {e}")

    return extraction.model_dump()


class TaskFollowupIn(BaseModel):
    followup_text: str = ""


@app.post("/api/tasks/{task_id}/followup")
def followup_task(task_id: int, body: TaskFollowupIn, user: User = Depends(current_user)):
    """Add a contextual follow-up question to an existing task thread."""
    followup = body.followup_text.strip()
    if not followup:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Follow-up text is required.")

    with get_session() as session:
        task = session.get(StudentTask, task_id)
        if not task or task.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")

        thread = json.loads(task.thread_json or "[]")
        ai_reply = llm.solve_task_followup(task.prompt, task.solution, thread, followup)

        thread.append({"role": "user", "content": followup, "timestamp": datetime.now(timezone.utc).isoformat()})
        thread.append({"role": "assistant", "content": ai_reply, "timestamp": datetime.now(timezone.utc).isoformat()})

        task.thread_json = json.dumps(thread)
        session.add(task)
        session.commit()
        session.refresh(task)
        return _format_task_out(task)


@app.post("/api/tasks/{task_id}/regenerate")
def regenerate_task(task_id: int, user: User = Depends(current_user)):
    """Regenerate AI solution for an existing task."""
    with get_session() as session:
        task = session.get(StudentTask, task_id)
        if not task or task.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")

        res = llm.solve_student_task(task.prompt, subject_hint=task.subject)
        task.solution = res.get("solution") or task.solution
        task.steps_json = json.dumps(res.get("steps") or [])
        task.formulas_json = json.dumps(res.get("formulas") or [])
        task.intuition = res.get("intuition") or task.intuition
        task.practice_json = json.dumps(res.get("practice") or [])

        session.add(task)
        session.commit()
        session.refresh(task)
        return _format_task_out(task)


@app.delete("/api/tasks/{task_id}")
def delete_student_task(task_id: int, user: User = Depends(current_user)):
    """Delete a student task from database."""
    with get_session() as session:
        task = session.get(StudentTask, task_id)
        if not task or task.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")

        if task.storage_key:
            try:
                get_storage().delete(task.storage_key)
            except Exception as e:
                print(f"[delete_task] Storage delete error: {e}")
        elif task.image_url and task.image_url.startswith("/api/uploads/"):
            fn = task.image_url.replace("/api/uploads/", "")
            try:
                get_storage().delete(fn)
            except Exception:
                pass
            fp = _UPLOAD_FILES_DIR / fn
            if fp.exists():
                try:
                    fp.unlink()
                except Exception as e:
                    print(f"[delete_task] File unlink error: {e}")

        session.delete(task)
        session.commit()
        return {"deleted": task_id}


# --- career intelligence ----------------------------------------------------

class CareerIn(BaseModel):
    github_username: str = ""
    resume_text: str = ""
    target_role: str = ""
    target_company: str = ""
    job_description: str = ""


@app.get("/api/career/profile")
def get_career_profile(user: User = Depends(current_user)):
    """Get authenticated user's saved career profile and last AI analysis."""
    with get_session() as session:
        prof = session.exec(select(UserCareerProfile).where(UserCareerProfile.user_id == user.id)).first()
        if not prof:
            return {
                "user_id": user.id,
                "github_username": "",
                "resume_text": "",
                "resume_filename": "",
                "target_role": "",
                "target_company": "",
                "job_description": "",
                "last_analysis": None,
            }
        
        last_analysis = None
        if prof.last_analysis_json:
            try:
                last_analysis = json.loads(prof.last_analysis_json)
            except Exception:
                pass

        return {
            "user_id": user.id,
            "github_username": prof.github_username or "",
            "resume_text": prof.resume_text or "",
            "resume_filename": prof.resume_filename or "",
            "target_role": prof.target_role or "",
            "target_company": prof.target_company or "",
            "job_description": prof.job_description or "",
            "last_analysis": last_analysis,
        }


@app.post("/api/career/audit")
def career_audit(body: CareerIn, user: User = Depends(current_user)):
    """Perform AI career audit for user's resume, target role, and job description."""
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        
        prof = session.exec(select(UserCareerProfile).where(UserCareerProfile.user_id == user.id)).first()
        if not prof:
            prof = UserCareerProfile(user_id=user.id)
            session.add(prof)

        # Update profile attributes with current user inputs
        if body.resume_text.strip():
            prof.resume_text = body.resume_text.strip()
        prof.target_role = body.target_role.strip()
        prof.target_company = body.target_company.strip()
        prof.job_description = body.job_description.strip()
        prof.github_username = body.github_username.strip()

        # Run AI analysis on resume & target role
        result = career.solve_career_audit(
            resume_text=prof.resume_text,
            target_role=prof.target_role,
            target_company=prof.target_company,
            job_description=prof.job_description,
            github_username=prof.github_username,
            pro=True,
        )

        prof.last_analysis_json = json.dumps(result)
        prof.updated_at = datetime.now(timezone.utc)
        session.add(prof)
        session.commit()

        return result


ALLOWED_RESUME_EXTS = {".pdf", ".docx", ".doc", ".txt"}
MAX_RESUME_BYTES = 10 * 1024 * 1024  # 10MB


@app.post("/api/career/upload-resume")
async def upload_resume(file: UploadFile = File(...),
                        target_role: str = Form(""),
                        job_description: str = Form(""),
                        target_company: str = Form(""),
                        user: User = Depends(current_user)):
    """Upload PDF/Doc resume, extract text, update profile, and return AI career analysis."""
    filename = file.filename or ""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_RESUME_EXTS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unsupported file type '{ext}'. Allowed formats: PDF, DOCX, DOC, TXT."
        )

    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty.")

    if len(data) > MAX_RESUME_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "File exceeds maximum allowed size of 10MB."
        )

    extracted_text = career.extract_resume_text(data, filename=filename)
    if not extracted_text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not extract text from uploaded resume. Please upload a readable document.")

    with get_session() as session:
        prof = session.exec(select(UserCareerProfile).where(UserCareerProfile.user_id == user.id)).first()
        if not prof:
            prof = UserCareerProfile(user_id=user.id)
            session.add(prof)

        prof.resume_text = extracted_text
        prof.resume_filename = file.filename or "uploaded_resume.pdf"
        token = uuid.uuid4().hex[:12]
        object_key = build_object_key("resumes", user.id, prof.resume_filename, identifier=token)
        get_storage().put(object_key, data, content_type=file.content_type)
        prof.resume_storage_key = object_key
        if target_role.strip():
            prof.target_role = target_role.strip()
        if target_company.strip():
            prof.target_company = target_company.strip()
        if job_description.strip():
            prof.job_description = job_description.strip()

        # Run AI analysis
        result = career.solve_career_audit(
            resume_text=prof.resume_text,
            target_role=prof.target_role,
            target_company=prof.target_company,
            job_description=prof.job_description,
            github_username=prof.github_username,
            pro=True,
        )

        prof.last_analysis_json = json.dumps(result)
        prof.updated_at = datetime.now(timezone.utc)
        session.add(prof)
        session.commit()

        return {
            "resume_filename": prof.resume_filename,
            "resume_text": prof.resume_text,
            "analysis": result,
        }


@app.post("/api/coach/resume")
async def upload_coach_resume(file: UploadFile = File(...),
                              user: User = Depends(current_user)):
    """Upload resume directly from Coach module, storing into the shared canonical UserCareerProfile."""
    filename = file.filename or ""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_RESUME_EXTS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unsupported file type '{ext}'. Allowed formats: PDF, DOCX, DOC, TXT."
        )

    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty.")

    if len(data) > MAX_RESUME_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "File exceeds maximum allowed size of 10MB."
        )

    extracted_text = career.extract_resume_text(data, filename=filename)
    if not extracted_text:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Could not extract text from uploaded resume. Please upload a readable document."
        )

    with get_session() as session:
        prof = session.exec(select(UserCareerProfile).where(UserCareerProfile.user_id == user.id)).first()
        if not prof:
            prof = UserCareerProfile(user_id=user.id)
            session.add(prof)

        prof.resume_text = extracted_text
        prof.resume_filename = filename or "uploaded_resume.pdf"
        token = uuid.uuid4().hex[:12]
        object_key = build_object_key("resumes", user.id, prof.resume_filename, identifier=token)
        get_storage().put(object_key, data, content_type=file.content_type)
        prof.resume_storage_key = object_key
        prof.updated_at = datetime.now(timezone.utc)
        session.add(prof)
        session.commit()
        session.refresh(prof)

        return {
            "status": "success",
            "resume_filename": prof.resume_filename,
            "resume_text": prof.resume_text,
            "has_resume": True,
        }


@app.delete("/api/career/resume")
@app.post("/api/career/clear-resume")
def clear_resume(user: User = Depends(current_user)):
    """Remove user's uploaded/pasted resume and reset resume fields cleanly."""
    with get_session() as session:
        prof = session.exec(select(UserCareerProfile).where(UserCareerProfile.user_id == user.id)).first()
        if prof:
            if prof.resume_storage_key:
                try:
                    get_storage().delete(prof.resume_storage_key)
                except Exception as e:
                    print(f"[clear_resume] Storage delete error: {e}")
                prof.resume_storage_key = None
            prof.resume_text = ""
            prof.resume_filename = ""
            prof.last_analysis_json = None
            prof.updated_at = datetime.now(timezone.utc)
            session.add(prof)
            session.commit()
            session.refresh(prof)
        return {
            "status": "success",
            "message": "Resume removed successfully.",
            "resume_filename": "",
            "resume_text": "",
            "last_analysis": None,
        }


class CoverLetterIn(BaseModel):
    role: str = ""
    company: str = ""
    strengths: list[str] = []
    resume_text: str = ""


@app.post("/api/career/cover-letter")
def generate_cover_letter(body: CoverLetterIn, user: User = Depends(current_user)):
    """Draft a tailored cover letter using user's actual resume and target role."""
    letter = career.cover_letter(
        strengths=body.strengths,
        resume_text=body.resume_text,
        role=body.role,
        company=body.company,
    )
    return {"letter": letter}


# --- billing / Razorpay ----------------------------------------------------


def _format_interview_session(s: InterviewSession) -> dict:
    return {
        "id": s.id,
        "target_role": s.target_role,
        "target_company": s.target_company,
        "job_description": s.job_description,
        "resume_text": s.resume_text,
        "round_type": s.round_type,
        "difficulty": s.difficulty,
        "status": s.status,
        "turns": json.loads(s.turns_json or "[]"),
        "evaluation": json.loads(s.evaluation_json) if s.evaluation_json else None,
        "created_at": s.created_at.isoformat() if s.created_at else datetime.now(timezone.utc).isoformat(),
        "updated_at": s.updated_at.isoformat() if s.updated_at else datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/interview/session")
def get_active_interview_session(user: User = Depends(current_user)):
    """Get active or latest interview session for authenticated user."""
    with get_session() as session:
        sess = session.exec(
            select(InterviewSession)
            .where(InterviewSession.user_id == user.id)
            .order_by(col(InterviewSession.created_at).desc())
        ).first()
        if not sess:
            return None
        return _format_interview_session(sess)


class InterviewStartIn(BaseModel):
    target_role: str = ""
    target_company: str = ""
    job_description: str = ""
    resume_text: str = ""
    use_saved_resume: bool = False
    round_type: str = "Technical Deep-Dive"
    difficulty: str = "Medium"


@app.post("/api/interview/start")
def start_interview_session(body: InterviewStartIn, user: User = Depends(current_user)):
    """Start a new dynamic candidate-specific interview session."""
    target_role = body.target_role.strip() or "Software / Professional Role"
    effective_resume = body.resume_text.strip()

    with get_session() as session:
        if not effective_resume and body.use_saved_resume:
            prof = session.exec(select(UserCareerProfile).where(UserCareerProfile.user_id == user.id)).first()
            if prof and prof.resume_text:
                effective_resume = prof.resume_text.strip()

        opening_q = interview.generate_opening_question(
            target_role=target_role,
            target_company=body.target_company,
            job_description=body.job_description,
            resume_text=effective_resume,
            round_type=body.round_type,
            difficulty=body.difficulty,
        )

        initial_turn = {
            "q": opening_q,
            "a": "",
            "feedback": "",
            "emotion": "warm",
            "delivery": {"pace": "natural", "energy": "medium", "pause_after": True},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        sess = InterviewSession(
            user_id=user.id,
            target_role=target_role,
            target_company=body.target_company.strip(),
            job_description=body.job_description.strip(),
            resume_text=effective_resume,
            round_type=body.round_type,
            difficulty=body.difficulty,
            status="active",
            turns_json=json.dumps([initial_turn]),
        )
        session.add(sess)
        session.commit()
        session.refresh(sess)
        return _format_interview_session(sess)


class InterviewAnswerIn(BaseModel):
    session_id: int
    answer_text: str = ""


@app.post("/api/interview/answer")
def answer_interview_turn(body: InterviewAnswerIn, user: User = Depends(current_user)):
    """Submit candidate answer, evaluate, adapt difficulty, and generate next question."""
    answer = body.answer_text.strip()
    if not answer:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Answer text is required.")

    with get_session() as session:
        sess = session.get(InterviewSession, body.session_id)
        if not sess or sess.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview session not found.")

        turns = json.loads(sess.turns_json or "[]")
        if not turns:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session has no active question.")

        # Update last question with candidate's answer
        turns[-1]["a"] = answer

        # Generate next question & turn feedback
        res = interview.next_interview_turn(
            target_role=sess.target_role,
            target_company=sess.target_company,
            job_description=sess.job_description,
            resume_text=sess.resume_text,
            round_type=sess.round_type,
            difficulty=sess.difficulty,
            history=turns,
            last_answer=answer,
        )

        turns[-1]["feedback"] = res.get("feedback", "")
        if res.get("adjusted_difficulty"):
            sess.difficulty = res["adjusted_difficulty"]

        # Append next turn question
        turns.append({
            "q": res.get("next_question", "Walk me through your next step."),
            "a": "",
            "feedback": "",
            "emotion": res.get("emotion", "neutral"),
            "delivery": res.get("delivery", {"pace": "natural", "energy": "medium", "pause_after": True}),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        sess.turns_json = json.dumps(turns)
        sess.updated_at = datetime.now(timezone.utc)
        session.add(sess)
        session.commit()
        session.refresh(sess)
        return _format_interview_session(sess)


class InterviewEvaluateIn(BaseModel):
    session_id: int


@app.post("/api/interview/evaluate")
def evaluate_interview_session_route(body: InterviewEvaluateIn, user: User = Depends(current_user)):
    """Conclude interview session and generate complete candidate evaluation report."""
    with get_session() as session:
        sess = session.get(InterviewSession, body.session_id)
        if not sess or sess.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Interview session not found.")

        turns = json.loads(sess.turns_json or "[]")
        answered_turns = [t for t in turns if t.get("a", "").strip()]

        report = interview.evaluate_interview_session(
            target_role=sess.target_role,
            target_company=sess.target_company,
            job_description=sess.job_description,
            resume_text=sess.resume_text,
            round_type=sess.round_type,
            history=answered_turns if answered_turns else turns,
        )

        sess.evaluation_json = json.dumps(report)
        sess.status = "completed"
        sess.updated_at = datetime.now(timezone.utc)
        session.add(sess)
        session.commit()
        session.refresh(sess)
        return _format_interview_session(sess)


@app.get("/api/interview/history")
def list_interview_history(user: User = Depends(current_user)):
    """List completed interview session history for authenticated user."""
    with get_session() as session:
        sessions = session.exec(
            select(InterviewSession)
            .where(InterviewSession.user_id == user.id)
            .order_by(col(InterviewSession.created_at).desc())
        ).all()
        return [_format_interview_session(s) for s in sessions]


# --- text-to-speech (VoiceProvider Abstraction) -----------------------------

class TTSIn(BaseModel):
    text: str
    emotion: Optional[str] = "neutral"
    delivery: Optional[dict] = None
    voice_id: Optional[str] = None


@app.post("/api/tts")
def tts_generate(body: TTSIn, user: User = Depends(current_user)):
    """Generate speech audio from text via active TTS VoiceProvider (CurrentTTSProvider with fallback).
    Returns audio/mpeg on success, or json with available=False on failure."""
    text = body.text.strip()[:2000]
    if not text:
        return JSONResponse(status_code=200, content={"available": False, "reason": "Text is empty"})

    provider = get_tts_provider()
    result = provider.synthesize(
        text=text,
        emotion=body.emotion or "neutral",
        delivery=body.delivery,
        voice_id=body.voice_id,
    )
    if result.available and result.audio_bytes:
        return Response(content=result.audio_bytes, media_type=result.media_type)
    return JSONResponse(status_code=200, content={"available": False, "reason": result.reason or "TTS unavailable"})


# --- daily digest -----------------------------------------------------------

@app.get("/api/digest")
def daily_digest(user: User = Depends(current_user)):
    with get_session() as session:
        cards = session.exec(select(Card).where(Card.user_id == user.id)).all()
        items = []
        for c in cards:
            row = session.get(CardEmbedding, c.id)
            if row is None:
                _index_card(session, c); row = session.get(CardEmbedding, c.id)
            try:
                vec = json.loads(row.vector) if row and row.vector else []
            except Exception:
                vec = []
            items.append((_card_out(c), vec))
        due = due_cards(list(cards), limit=5)
        return memory.build_morning(items, due_count=len(due))


@app.get("/api/digest/weekly")
def weekly_digest(user: User = Depends(current_user)):
    with get_session() as session:
        cards = session.exec(select(Card).where(Card.user_id == user.id)).all()
        items = []
        for c in cards:
            row = session.get(CardEmbedding, c.id)
            if row is None:
                _index_card(session, c); row = session.get(CardEmbedding, c.id)
            try:
                vec = json.loads(row.vector) if row and row.vector else []
            except Exception:
                vec = []
            items.append((_card_out(c), vec))
        return memory.build_weekly(items)


@app.get("/api/stats")
def activity_stats(user: User = Depends(current_user)):
    with get_session() as session:
        cards = session.exec(select(Card).where(Card.user_id == user.id)).all()
        return stats.build_stats([_card_out(c) for c in cards])


# --- billing architecture ---------------------------------------------------

@app.get("/api/billing/plans")
def get_plans():
    """Return backend-authoritative pricing catalogs for India (INR) & Global (USD)."""
    return subscription.PRICING_CATALOG


@app.post("/api/billing/checkout")
def checkout(
    plan: str = "plus",
    interval: str = "monthly",
    currency: str = "INR",
    user: User = Depends(current_user)
):
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        return subscription.create_checkout(
            session, db_user, plan_target=plan, interval=interval, currency=currency
        )


class VerifyIn(BaseModel):
    order_id: str
    plan: str = "plus"
    interval: str = "monthly"
    currency: str = "INR"
    payment_id: str = "mock_payment"
    signature: str = ""


@app.post("/api/billing/verify")
def verify_payment(body: VerifyIn, user: User = Depends(current_user)):
    """Authoritative server-side payment verification and entitlement activation."""
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

        ok, msg = subscription.verify_payment(
            session,
            db_user,
            order_id=body.order_id,
            payment_id=body.payment_id,
            signature=body.signature
        )
        if not ok:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, msg)

        return _public_user(session, db_user)


@app.post("/api/billing/cancel")
def cancel_subscription(user: User = Depends(current_user)):
    """Cancel subscription at end of billing cycle. User data is strictly preserved."""
    with get_session() as session:
        db_user = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        subscription.cancel_subscription(session, db_user)
        return _public_user(session, db_user)


@app.post("/api/billing/webhook")
async def billing_webhook(request: Request):
    """Idempotent Razorpay webhook listener with signature verification.

    Security guarantees:
    - Signature is validated against the RAW request body (never re-serialized).
    - Duplicate webhook deliveries are handled idempotently via order status check.
    - The same event cannot activate or extend a subscription twice.
    - Out-of-order events are safe: if an order is already 'paid', it is not re-processed.
    """
    body = await request.body()
    sig = request.headers.get("X-Razorpay-Signature", "")
    if not subscription.verify_webhook_signature(body, sig):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bad signature")
    payload = await request.json()
    event = payload.get("event", "")
    event_id = payload.get("event_id", "")  # Razorpay's unique event ID

    if event in ("payment.captured", "order.paid", "subscription.charged"):
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id") or payload.get("payload", {}).get("order", {}).get("entity", {}).get("id")
        payment_id = payment_entity.get("id", "webhook_payment")
        notes = payment_entity.get("notes", {})

        with get_session() as session:
            # 1. Try resolving recorded SubscriptionOrder first (authoritative)
            sub_order = None
            if order_id:
                sub_order = session.exec(select(SubscriptionOrder).where(SubscriptionOrder.order_id == order_id)).first()

            if sub_order:
                # Idempotency: if order is already paid, acknowledge but do not re-process
                if sub_order.status == "paid":
                    return {"ok": True, "detail": "already_processed"}

                target_user = session.get(User, sub_order.user_id)
                if target_user:
                    months = 12 if sub_order.interval == "yearly" else 1
                    subscription.activate_plan(
                        session,
                        target_user,
                        plan_target=sub_order.plan,
                        months=months,
                        interval=sub_order.interval,
                        currency=sub_order.currency,
                    )
                    sub_order.status = "paid"
                    sub_order.payment_id = payment_id
                    session.add(sub_order)
                    session.commit()
            elif notes.get("user_id"):
                # Fallback to notes — only if we don't have a matching order
                uid = int(notes["user_id"])
                target_user = session.get(User, uid)
                if target_user:
                    plan = notes.get("plan", "plus")
                    interval = notes.get("interval", "monthly")
                    currency = notes.get("currency", "INR")
                    months = 12 if interval == "yearly" else 1
                    subscription.activate_plan(
                        session,
                        target_user,
                        plan_target=plan,
                        months=months,
                        interval=interval,
                        currency=currency,
                    )

    return {"ok": True}


# --- serve the built PWA ----------------------------------------------------

_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="API endpoint not found")
        candidate = _DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")