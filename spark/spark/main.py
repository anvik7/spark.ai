"""Spark API. One FastAPI app exposing auth, card ingestion, the
spaced-repetition review loop, tag/search + connect-the-dots, and Razorpay
billing. Serves the built React PWA from ./web/dist in production."""
import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import (Depends, FastAPI, File, Form, HTTPException, Request,
                     UploadFile, status)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from sqlmodel import col, select

try:
    import razorpay
except ImportError:
    razorpay = None

from . import career, embeddings, interview, llm, memory, stats, subscription
from .auth import (current_user, find_by_email, get_or_create_user, make_token,
                   verify_password)
from .config import get_settings
from .ingest import build_card_fields
from .models import Card, CardEmbedding, User, get_session, init_db
from .srs import due_cards, schedule
from .routes.goals import router as goals_router
from .leaderboard import router as leaderboard_router

settings = get_settings()


@asynccontextmanager
async def _lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    yield

app = FastAPI(title=settings.app_name, lifespan=_lifespan)
app.include_router(goals_router)
app.include_router(leaderboard_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    return {
        "id": user.id, "email": user.email, "name": user.name,
        "plan": "pro" if subscription.is_pro(user) else "free",
        "plan_until": user.plan_until,
        "card_count": len(cards),
        "free_card_limit": settings.free_card_limit,
    }


def _card_out(c: Card) -> dict:
    return {
        "id": c.id, "kind": c.kind, "raw": c.raw,
        "title": getattr(c, "title", ""), "summary": c.summary,
        "tags": c.tags, "topic": getattr(c, "topic", ""),
        "difficulty": getattr(c, "difficulty", 0),
        "importance": getattr(c, "importance", 0),
        "source_type": getattr(c, "source_type", c.kind),
        "source_url": c.source_url,
        "created_at": c.created_at, "due_on": c.due_on, "reps": c.reps,
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


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    with get_session() as session:
        return _public_user(session, user)


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
        fields = build_card_fields("voice", audio_bytes=audio, lang_hint=lang_hint)
        return _card_out(_save_card(session, user, fields))


@app.post("/api/cards/file")
async def create_file_card(file: UploadFile = File(...),
                           user: User = Depends(current_user)):
    data = await file.read()
    is_pdf = data[:5] == b"%PDF-"  # real PDFs always start with this magic number
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
        if is_pdf:
            fields = build_card_fields("pdf", pdf_bytes=data)
        else:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Only PDF files are supported here — use the image capture for photos.")
        return _card_out(_save_card(session, user, fields))


@app.get("/api/cards")
def list_cards(tag: Optional[str] = None, q: Optional[str] = None,
               user: User = Depends(current_user)):
    with get_session() as session:
        cards = session.exec(
            select(Card).where(Card.user_id == user.id)
            .order_by(col(Card.created_at).desc())).all()
        if tag:
            cards = [c for c in cards if tag.lower() in [t.lower() for t in c.tags]]
        if q:
            ql = q.lower()
            cards = [c for c in cards
                     if ql in c.raw.lower() or ql in c.summary.lower()
                     or any(ql in t.lower() for t in c.tags)]
        return [_card_out(c) for c in cards]


@app.delete("/api/cards/{card_id}")
def delete_card(card_id: int, user: User = Depends(current_user)):
    with get_session() as session:
        card = session.get(Card, card_id)
        if not card or card.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Card not found")
        session.delete(card)
        session.commit()
        return {"deleted": card_id}


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


# --- career intelligence ----------------------------------------------------

class CareerIn(BaseModel):
    github_username: str = ""
    resume_text: str = ""


@app.post("/api/career/audit")
def career_audit(body: CareerIn, user: User = Depends(current_user)):
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        user = db_user
        ok, msg = subscription.check_ai_quota(session, user)
        if not ok:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, msg)
        if not body.github_username.strip() and not body.resume_text.strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "Add a GitHub username or paste your resume.")
        try:
            return career.audit(body.github_username.strip(),
                                body.resume_text.strip(),
                                pro=subscription.is_pro(user))
        except Exception as e:
            print(f"[career] audit crashed: {e}")
            return {
                "readiness": 0,
                "note": f"Analysis failed: {e}",
                "strengths": [],
                "gaps": [],
                "plan": [],
            }


class CoverLetterIn(BaseModel):
    role: str = ""              # target job title / company
    strengths: list[str] = []   # skill names already found by /audit
    resume_text: str = ""       # pasted resume (optional, improves output)


@app.post("/api/career/cover-letter")
def generate_cover_letter(body: CoverLetterIn, user: User = Depends(current_user)):
    """Draft a personalised cover letter from the user's skills. Pro only."""
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        if not subscription.is_pro(db_user):
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED,
                                "Cover letter drafting is a Pro feature. Upgrade to unlock.")
        ok, msg = subscription.check_ai_quota(session, db_user)
        if not ok:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, msg)
    try:
        letter = career.cover_letter(
            strengths=body.strengths,
            resume_text=body.resume_text,
            role=body.role,
        )
        return {"letter": letter}
    except Exception as e:
        print(f"[career] cover_letter crashed: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR,
                            f"Could not generate cover letter: {e}")


@app.post("/api/interview")
def interview_turn(body: InterviewIn, user: User = Depends(current_user)):
    with get_session() as session:
        u = session.get(User, user.id)
        if not u:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        ok, msg = subscription.check_ai_quota(session, u)
        if not ok:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, msg)
    if body.action == "score":
        return interview.scorecard(body.role, body.company, body.transcript)
    return interview.next_turn(body.role, body.company, body.context, body.round, body.history)


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


# --- subscribe (Razorpay flow) ------------------------------------------

@app.post("/api/subscribe/order")
def create_order(user: User = Depends(current_user)):
    if razorpay is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Razorpay package is not installed.")
    s = get_settings()
    client = razorpay.Client(auth=(s.razorpay_key_id, s.razorpay_key_secret))
    order = client.order.create({"amount": 19900, "currency": "INR", "receipt": f"spark_{user.id}"})  # type: ignore
    return {"order_id": order["id"], "amount": order["amount"], "key_id": s.razorpay_key_id}


# --- billing ----------------------------------------------------------------

@app.post("/api/billing/checkout")
def checkout(user: User = Depends(current_user)):
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        user = db_user
        return subscription.create_checkout(user)


class VerifyIn(BaseModel):
    order_id: str
    payment_id: str = "mock_payment"
    signature: str = ""


@app.post("/api/billing/verify")
def verify_payment(body: VerifyIn, user: User = Depends(current_user)):
    """Called by the client after Razorpay Checkout succeeds (and by the mock
    flow). The webhook is the source of truth; this gives instant UX feedback."""
    with get_session() as session:
        db_user: User | None = session.get(User, user.id)
        if not db_user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
        user = db_user
        subscription.activate_pro(session, user, months=1)
        return _public_user(session, user)


@app.post("/api/billing/webhook")
async def billing_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("X-Razorpay-Signature", "")
    if not subscription.verify_webhook_signature(body, sig):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bad signature")
    payload = await request.json()
    event = payload.get("event", "")
    if event in ("payment.captured", "order.paid", "subscription.charged"):
        notes = (payload.get("payload", {}).get("payment", {})
                 .get("entity", {}).get("notes", {}))
        uid = notes.get("user_id")
        if uid:
            with get_session() as session:
                user = session.get(User, int(uid))
                if user:
                    subscription.activate_pro(session, user, months=1)
    return {"ok": True}


# --- serve the built PWA ----------------------------------------------------

_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        candidate = _DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")