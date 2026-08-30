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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
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
from .models import Card, CardEmbedding, InterviewSession, StudentTask, StudySession, User, UserCareerProfile, get_session, init_db
from .srs import due_cards, schedule
from .routes.goals import router as goals_router
from .leaderboard import router as leaderboard_router
from .routes.study_logs import router as study_logs_router
from .routes.papers import router as papers_router
from .routes.circles import router as circles_router
settings = get_settings()


@asynccontextmanager
async def _lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    yield

app = FastAPI(title=settings.app_name, lifespan=_lifespan)
app.include_router(goals_router)
app.include_router(leaderboard_router)
app.include_router(study_logs_router)
app.include_router(papers_router)
app.include_router(circles_router)
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
        "avatar_url": getattr(user, "avatar_url", "") or "",
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


import uuid

@app.get("/api/me")
def me(user: User = Depends(current_user)):
    with get_session() as session:
        return _public_user(session, user)


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


@app.get("/api/uploads/{filename}")
def serve_upload(filename: str):
    for folder in [_UPLOAD_FILES_DIR, _UPLOAD_DIR, _UPLOAD_DIR / "avatars"]:
        fp = folder / filename
        if fp.exists() and fp.is_file():
            return FileResponse(fp)
    # Return 200 OK empty image/response for missing legacy files to prevent browser console 404 spam
    return Response(content=b"", media_type="image/png")


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
        
        # Save voice recording file to disk
        ext = Path(file.filename or "voice.webm").suffix or ".webm"
        filename = f"voice_{user.id}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = _UPLOAD_FILES_DIR / filename
        with open(file_path, "wb") as f:
            f.write(audio)

        fields = build_card_fields("voice", audio_bytes=audio, lang_hint=lang_hint)
        fields["source_url"] = f"/api/uploads/{filename}"
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
        filename = f"file_{user.id}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = _UPLOAD_FILES_DIR / filename
        with open(file_path, "wb") as f:
            f.write(data)

        if is_pdf:
            fields = build_card_fields("pdf", pdf_bytes=data)
            fields["source_url"] = f"/api/uploads/{filename}"
            fields["kind"] = "pdf"
            if not fields.get("title"):
                fields["title"] = file.filename or "PDF Document"
        elif is_image:
            fields = build_card_fields("image", raw=f"Image capture: {file.filename or 'photo'}")
            fields["source_url"] = f"/api/uploads/{filename}"
            fields["kind"] = "image"
            if not fields.get("title"):
                fields["title"] = file.filename or "Photo / Diagram"
        else:
            fields = build_card_fields("text", raw=f"Uploaded file: {file.filename}")
            fields["source_url"] = f"/api/uploads/{filename}"
            fields["kind"] = "file"
            fields["title"] = file.filename or "Uploaded File"

        return _card_out(_save_card(session, user, fields))


@app.get("/api/cards")
@app.get("/api/captures")
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

        # Unlink any StudySession referencing this card
        study_sessions = session.exec(select(StudySession).where(StudySession.card_id == card_id)).all()
        for s in study_sessions:
            s.card_id = None
            session.add(s)

        # Delete media file from disk if present
        if card.source_url and card.source_url.startswith("/api/uploads/"):
            fn = card.source_url.replace("/api/uploads/", "")
            fp = _UPLOAD_FILES_DIR / fn
            if fp.exists():
                try:
                    fp.unlink()
                except Exception as e:
                    print(f"[delete_card] Error removing file {fp}: {e}")

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
        "created_at": t.created_at.isoformat() if t.created_at else datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/tasks")
def list_student_tasks(user: User = Depends(current_user)):
    """List real saved student tasks for authenticated user."""
    with get_session() as session:
        tasks = session.exec(
            select(StudentTask)
            .where(StudentTask.user_id == user.id)
            .order_by(col(StudentTask.created_at).desc())
        ).all()
        return [_format_task_out(t) for t in tasks]


class TaskSolveIn(BaseModel):
    prompt: str = ""
    subject_hint: str = ""


@app.post("/api/tasks/solve")
def solve_task(body: TaskSolveIn, user: User = Depends(current_user)):
    """Solve an academic task, save DB record for user, return created task."""
    prompt = body.prompt.strip()
    if not prompt:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Prompt is required.")

    res = llm.solve_student_task(prompt, subject_hint=body.subject_hint)

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

    ext = Path(file.filename or "file.png").suffix or ".png"
    filename = f"task_{user.id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = _UPLOAD_FILES_DIR / filename
    with open(file_path, "wb") as f:
        f.write(data)

    extracted_text = ""
    if data[:5] == b"%PDF-" or (file.filename and file.filename.lower().endswith(".pdf")):
        extracted_text = career.extract_resume_text(data, filename=file.filename or "")

    full_prompt = (prompt + "\n" + extracted_text).strip() if extracted_text else (prompt.strip() or f"Problem in file: {file.filename}")
    res = llm.solve_student_task(full_prompt, subject_hint=subject_hint)

    with get_session() as session:
        task = StudentTask(
            user_id=user.id,
            subject=res.get("subject") or "General Academic",
            icon=res.get("icon") or "📚",
            title=res.get("title") or prompt[:80] or file.filename or "Uploaded Problem",
            prompt=full_prompt,
            image_url=f"/api/uploads/{filename}",
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

        if task.image_url and task.image_url.startswith("/api/uploads/"):
            fn = task.image_url.replace("/api/uploads/", "")
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

        # Update profile attributes if provided
        if body.resume_text.strip():
            prof.resume_text = body.resume_text.strip()
        if body.target_role.strip():
            prof.target_role = body.target_role.strip()
        if body.target_company.strip():
            prof.target_company = body.target_company.strip()
        if body.job_description.strip():
            prof.job_description = body.job_description.strip()
        if body.github_username.strip():
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


@app.post("/api/career/upload-resume")
async def upload_resume(file: UploadFile = File(...),
                        target_role: str = Form(""),
                        job_description: str = Form(""),
                        user: User = Depends(current_user)):
    """Upload PDF/Doc resume, extract text, update profile, and return AI career analysis."""
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty.")

    extracted_text = career.extract_resume_text(data, filename=file.filename or "")
    if not extracted_text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Could not extract text from uploaded resume. Please paste resume text directly.")

    with get_session() as session:
        prof = session.exec(select(UserCareerProfile).where(UserCareerProfile.user_id == user.id)).first()
        if not prof:
            prof = UserCareerProfile(user_id=user.id)
            session.add(prof)

        prof.resume_text = extracted_text
        prof.resume_filename = file.filename or "uploaded_resume.pdf"
        if target_role.strip():
            prof.target_role = target_role.strip()
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
    round_type: str = "Technical Deep-Dive"
    difficulty: str = "Medium"


@app.post("/api/interview/start")
def start_interview_session(body: InterviewStartIn, user: User = Depends(current_user)):
    """Start a new dynamic candidate-specific interview session."""
    target_role = body.target_role.strip() or "Software / Professional Role"

    opening_q = interview.generate_opening_question(
        target_role=target_role,
        target_company=body.target_company,
        job_description=body.job_description,
        resume_text=body.resume_text,
        round_type=body.round_type,
        difficulty=body.difficulty,
    )

    initial_turn = {
        "q": opening_q,
        "a": "",
        "feedback": "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    with get_session() as session:
        sess = InterviewSession(
            user_id=user.id,
            target_role=target_role,
            target_company=body.target_company.strip(),
            job_description=body.job_description.strip(),
            resume_text=body.resume_text.strip(),
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


# --- text-to-speech (MiniMax Speech 2.8) ------------------------------------

class TTSIn(BaseModel):
    text: str


@app.post("/api/tts")
def tts_generate(body: TTSIn, user: User = Depends(current_user)):
    """Generate speech audio from text via MiniMax Speech 2.8 Turbo.
    Returns audio/mpeg on success, or json with available=False on failure for clean client failover."""
    s = get_settings()
    if not s.minimax_api_key:
        return JSONResponse(status_code=200, content={"available": False, "reason": "MINIMAX_API_KEY not configured"})
    text = body.text.strip()[:2000]
    if not text:
        return JSONResponse(status_code=200, content={"available": False, "reason": "Text is empty"})
    try:
        r = httpx.post(
            "https://api.minimax.io/v1/t2a_v2",
            headers={"Authorization": f"Bearer {s.minimax_api_key}",
                     "Content-Type": "application/json"},
            json={
                "model": s.minimax_tts_model or "speech-2.8-turbo",
                "text": text,
                "voice_setting": {"voice_id": "Friendly_Person"},
            },
            timeout=15,
        )
        if r.status_code != 200:
            return JSONResponse(status_code=200, content={"available": False, "reason": f"MiniMax error {r.status_code}"})
        data = r.json()
        hex_audio = data.get("data", {}).get("audio", {}).get("audio_file") or data.get("audio_file")
        if not hex_audio:
            return JSONResponse(status_code=200, content={"available": False, "reason": "No audio in MiniMax response"})
        audio_bytes = bytes.fromhex(hex_audio)
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        print(f"[tts] Fallback triggered: {e}")
        return JSONResponse(status_code=200, content={"available": False, "reason": str(e)})


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