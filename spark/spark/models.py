"""Data model. SQLModel over SQLite for dev; flip database_url to a Postgres
URL for production (the brief's planned migration) with no code changes."""
from datetime import datetime, date, timezone, timedelta
from typing import Optional
from sqlmodel import SQLModel, Field, create_engine, Session, JSON, Column
from .config import get_settings

settings = get_settings()
_db_url = settings.database_url
# Managed hosts hand back postgres:// or postgresql://; pin the psycopg3 driver.
if _db_url.startswith("postgres://"):
    _db_url = "postgresql+psycopg://" + _db_url[len("postgres://"):]
elif _db_url.startswith("postgresql://"):
    _db_url = "postgresql+psycopg://" + _db_url[len("postgresql://"):]
_engine_kw = {"echo": False}
if _db_url.startswith("postgresql"):
    _engine_kw["pool_pre_ping"] = True  # survive managed-DB idle drops
engine = create_engine(_db_url, **_engine_kw)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    channel: str = "web"
    external_id: str = Field(index=True)
    email: Optional[str] = Field(default=None, index=True)
    hashed_password: Optional[str] = None
    name: str = ""
    avatar_url: Optional[str] = None
    plan: str = "free"
    plan_until: Optional[datetime] = None
    trial_active: bool = True
    trial_started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    trial_expires_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=14))
    digest_hour: int = 8
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Card(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    kind: str = "text"
    raw: str = ""
    title: str = ""
    summary: str = ""
    tags: list = Field(default_factory=list, sa_column=Column(JSON))
    topic: str = ""
    difficulty: int = 0
    importance: int = 0
    source_type: str = "text"
    source_url: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ease: float = 2.5
    interval_days: int = 0
    reps: int = 0
    due_on: date = Field(default_factory=date.today, index=True)
    is_public: bool = False
    share_token: Optional[str] = Field(default=None, index=True)


class UsageDay(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    day: date = Field(default_factory=date.today, index=True)
    ai_calls: int = 0


class CardEmbedding(SQLModel, table=True):
    card_id: int = Field(primary_key=True, foreign_key="card.id")
    vector: str = ""
    dim: int = 0


class StudySession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    card_id: Optional[int] = Field(default=None, foreign_key="card.id")
    subject: str = "General"
    material: str = ""
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    duration_seconds: int = 0
    was_focused: bool = False
    ambient_sound: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StudyMediaSource(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    source_type: str = "document"  # "video_file", "audio_file", "youtube_url", "document", "paper_id", "capture_id"
    title: str = ""
    description: str = ""
    file_path: Optional[str] = None
    url: Optional[str] = None
    duration_seconds: int = 0
    transcript_text: str = ""
    status: str = "UPLOADING"  # "UPLOADING", "PROCESSING", "ANALYZING", "CHAPTERING", "GENERATING_QUESTIONS", "READY", "FAILED"
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StudyActiveSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    source_id: int = Field(index=True, foreign_key="studymediasource.id")
    title: str = ""
    subject: str = "General Academic"
    current_chapter_index: int = 0
    current_time_seconds: float = 0.0
    completed_chapters_count: int = 0
    total_chapters_count: int = 0
    overall_mastery_percent: float = 0.0
    status: str = "in_progress"  # "in_progress", "completed"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StudyChapter(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="studyactivesession.id")
    chapter_index: int = 0
    title: str = ""
    start_time: float = 0.0
    end_time: float = 0.0
    duration_seconds: float = 0.0
    transcript_segment: str = ""
    short_explanation: str = ""
    key_concepts_json: str = "[]"
    learning_objective: str = ""
    difficulty: str = "Medium"
    status: str = "unstarted"  # "locked", "unstarted", "in_progress", "completed"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StudyQuestion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    chapter_id: int = Field(index=True, foreign_key="studychapter.id")
    question_type: str = "mcq"  # "mcq", "true_false", "short_answer"
    question_text: str = ""
    options_json: str = "[]"
    correct_answer: str = ""
    explanation: str = ""
    difficulty: str = "Medium"
    concept_tag: str = "General"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StudyAttempt(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    chapter_id: int = Field(index=True, foreign_key="studychapter.id")
    question_id: int = Field(index=True, foreign_key="studyquestion.id")
    user_answer: str = ""
    is_correct: bool = False
    score: float = 0.0
    time_taken_seconds: int = 0
    attempt_number: int = 1
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ActiveRecallEvaluation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    chapter_id: int = Field(index=True, foreign_key="studychapter.id")
    user_response_text: str = ""
    understanding_score: int = 0  # 0 to 100
    understood_concepts_json: str = "[]"
    missing_concepts_json: str = "[]"
    misconceptions_json: str = "[]"
    recommendation: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ConceptMastery(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    session_id: int = Field(index=True, foreign_key="studyactivesession.id")
    concept_name: str = ""
    mastery_score: float = 0.0  # 0 to 100
    status: str = "Learning"  # "Mastered", "Learning", "Needs Review"
    attempts_count: int = 0
    correct_count: int = 0
    last_evaluated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StudyMindMapNode(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="studyactivesession.id")
    node_key: str = ""
    label: str = ""
    parent_key: Optional[str] = None
    chapter_id: Optional[int] = None
    concept_tag: str = ""
    mastery_status: str = "Learning"  # "Mastered", "Learning", "Needs Review"
    depth: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserGoal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    goal_type: str = "daily"
    target_hours: float
    active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class QuestionPaper(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = ""
    exam_tag: str = ""
    subject: str = ""
    year: Optional[int] = None
    uploader_id: int = Field(index=True, foreign_key="user.id")
    file_path: str = ""          # R2 / Local storage key
    file_name: str = ""
    file_size: int = 0           # bytes
    download_count: int = 0
    save_count: int = 0
    reports_count: int = 0
    resource_type: str = "handwritten_notes" # "handwritten_notes" | "study_material" | "practice_set" | "official_guide" | "syllabus" | "lecture_notes"
    category: str = "General"                # "Civil Services" | "GATE" | "Engineering" | "Medical" | "Management" | "School" | "University" | "Professional" | "Other"
    language: str = "English"                # "English" | "Hindi" | "Spanish" | "Other"
    difficulty: str = "Medium"               # "Beginner" | "Medium" | "Advanced"
    is_public: bool = True                   # True = Community Resource Library, False = Private Vault
    page_count: int = 1
    extracted_ocr_text: str = ""
    uploader_name: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PaperDownloadLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    paper_id: int = Field(index=True, foreign_key="questionpaper.id")
    downloaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PaperBookmark(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    paper_id: int = Field(index=True, foreign_key="questionpaper.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PaperReport(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    paper_id: int = Field(index=True, foreign_key="questionpaper.id")
    reason: str = "inappropriate"  # "inappropriate" | "copyrighted" | "misleading" | "other"
    details: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StudyCircle(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = ""
    exam_tag: str = ""
    invite_code: str = Field(index=True, unique=True)
    owner_id: int = Field(index=True, foreign_key="user.id")
    is_private: bool = Field(default=False, index=True)
    target_user_id: Optional[int] = Field(default=None, index=True, foreign_key="user.id")
    avatar_icon: str = "💬"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CircleMember(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    circle_id: int = Field(index=True, foreign_key="studycircle.id")
    user_id: int = Field(index=True, foreign_key="user.id")
    role: str = "member"  # "owner" | "member"
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CircleMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    circle_id: int = Field(index=True, foreign_key="studycircle.id")
    user_id: int = Field(index=True, foreign_key="user.id")
    content: str = ""
    message_type: str = "text"  # "text" | "sticker" | "image" | "capture"
    media_url: Optional[str] = None
    sticker_id: Optional[str] = None
    capture_id: Optional[int] = None
    capture_title: Optional[str] = None
    capture_summary: Optional[str] = None
    capture_kind: Optional[str] = None
    reply_to_id: Optional[int] = Field(default=None, foreign_key="circlemessage.id")
    is_deleted: bool = False
    edited_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CircleMessageReaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    message_id: int = Field(index=True, foreign_key="circlemessage.id")
    user_id: int = Field(index=True, foreign_key="user.id")
    emoji: str = Field(index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserBlock(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    blocker_id: int = Field(index=True, foreign_key="user.id")
    blocked_id: int = Field(index=True, foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserReport(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reporter_id: int = Field(index=True, foreign_key="user.id")
    reported_user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    message_id: Optional[int] = Field(default=None, foreign_key="circlemessage.id")
    reason: str = "inappropriate"  # "inappropriate" | "spam" | "harassment" | "other"
    details: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CircleMute(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    circle_id: int = Field(index=True, foreign_key="studycircle.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserCareerProfile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, unique=True, foreign_key="user.id")
    github_username: str = ""
    resume_text: str = ""
    resume_filename: str = ""
    target_role: str = ""
    target_company: str = ""
    job_description: str = ""
    last_analysis_json: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StudentTask(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    subject: str = "General Academic"
    icon: str = "📚"
    title: str = ""
    prompt: str = ""
    image_url: Optional[str] = None
    solution: str = ""
    steps_json: str = "[]"
    formulas_json: str = "[]"
    intuition: str = ""
    practice_json: str = "[]"
    thread_json: str = "[]"
    status: str = "Solved by AI"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InterviewSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    target_role: str = ""
    target_company: str = ""
    job_description: str = ""
    resume_text: str = ""
    round_type: str = "Technical Deep-Dive"
    difficulty: str = "Medium"
    status: str = "active"
    turns_json: str = "[]"
    evaluation_json: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate()


def _migrate() -> None:
    from sqlalchemy import inspect, text as _sql
    try:
        with engine.begin() as conn:
            inspector = inspect(conn)

            # 1. User table schema sync
            if inspector.has_table("user"):
                user_cols = {c["name"] for c in inspector.get_columns("user")}
                if "avatar_url" not in user_cols:
                    print("[migrate] Adding avatar_url column to 'user' table...")
                    conn.execute(_sql('ALTER TABLE "user" ADD COLUMN avatar_url VARCHAR DEFAULT \'\''))
                if "trial_active" not in user_cols:
                    print("[migrate] Adding trial_active column to 'user' table...")
                    conn.execute(_sql('ALTER TABLE "user" ADD COLUMN trial_active BOOLEAN DEFAULT TRUE'))
                if "trial_started_at" not in user_cols:
                    print("[migrate] Adding trial_started_at column to 'user' table...")
                    conn.execute(_sql('ALTER TABLE "user" ADD COLUMN trial_started_at TIMESTAMP WITH TIME ZONE'))
                if "trial_expires_at" not in user_cols:
                    print("[migrate] Adding trial_expires_at column to 'user' table...")
                    conn.execute(_sql('ALTER TABLE "user" ADD COLUMN trial_expires_at TIMESTAMP WITH TIME ZONE'))

            # 2. Card table schema sync
            if inspector.has_table("card"):
                card_cols = {c["name"] for c in inspector.get_columns("card")}
                card_additions = {
                    "title": "VARCHAR DEFAULT ''",
                    "topic": "VARCHAR DEFAULT ''",
                    "difficulty": "INTEGER DEFAULT 0",
                    "importance": "INTEGER DEFAULT 0",
                    "source_type": "VARCHAR DEFAULT 'text'",
                }
                for col_name, col_ddl in card_additions.items():
                    if col_name not in card_cols:
                        print(f"[migrate] Adding {col_name} column to 'card' table...")
                        conn.execute(_sql(f'ALTER TABLE card ADD COLUMN {col_name} {col_ddl}'))

            # 3. UserGoal table schema sync
            if inspector.has_table("usergoal"):
                goal_cols = {c["name"] for c in inspector.get_columns("usergoal")}
                if "active" not in goal_cols:
                    print("[migrate] Adding active column to 'usergoal' table...")
                    if engine.dialect.name == "postgresql":
                        conn.execute(_sql("ALTER TABLE usergoal ADD COLUMN active BOOLEAN DEFAULT TRUE"))
                    else:
                        conn.execute(_sql("ALTER TABLE usergoal ADD COLUMN active BOOLEAN DEFAULT 1"))

            # 4. StudySession table schema sync
            if inspector.has_table("studysession"):
                session_cols = {c["name"] for c in inspector.get_columns("studysession")}
                if "material" not in session_cols:
                    print("[migrate] Adding material column to 'studysession' table...")
                    conn.execute(_sql("ALTER TABLE studysession ADD COLUMN material VARCHAR DEFAULT ''"))

            # 5. CircleMessage table schema sync
            if inspector.has_table("circlemessage"):
                msg_cols = {c["name"] for c in inspector.get_columns("circlemessage")}
                if "created_at" not in msg_cols:
                    print("[migrate] Adding created_at column to 'circlemessage' table...")
                    if engine.dialect.name == "postgresql":
                        conn.execute(_sql("ALTER TABLE circlemessage ADD COLUMN created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"))
                    else:
                        conn.execute(_sql("ALTER TABLE circlemessage ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP"))
                else:
                    # Fill any legacy NULL created_at rows
                    conn.execute(_sql("UPDATE circlemessage SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))

            # 7. Card table schema sync
            if inspector.has_table("card"):
                card_cols = {c["name"] for c in inspector.get_columns("card")}
                if "is_public" not in card_cols:
                    print("[migrate] Adding is_public column to 'card' table...")
                    if engine.dialect.name == "postgresql":
                        conn.execute(_sql("ALTER TABLE card ADD COLUMN is_public BOOLEAN DEFAULT FALSE"))
                    else:
                        conn.execute(_sql("ALTER TABLE card ADD COLUMN is_public BOOLEAN DEFAULT 0"))
            # 8. QuestionPaper table schema sync
            if inspector.has_table("questionpaper"):
                paper_cols = {c["name"] for c in inspector.get_columns("questionpaper")}
                paper_additions = {
                    "save_count": "INTEGER DEFAULT 0",
                    "reports_count": "INTEGER DEFAULT 0",
                    "resource_type": "VARCHAR DEFAULT 'handwritten_notes'",
                    "category": "VARCHAR DEFAULT 'General'",
                    "language": "VARCHAR DEFAULT 'English'",
                    "difficulty": "VARCHAR DEFAULT 'Medium'",
                    "page_count": "INTEGER DEFAULT 1",
                    "extracted_ocr_text": "TEXT DEFAULT ''",
                    "uploader_name": "VARCHAR DEFAULT ''",
                }
                for col_name, col_ddl in paper_additions.items():
                    if col_name not in paper_cols:
                        print(f"[migrate] Adding {col_name} column to 'questionpaper' table...")
                        conn.execute(_sql(f'ALTER TABLE questionpaper ADD COLUMN {col_name} {col_ddl}'))
                if "is_public" not in paper_cols:
                    print("[migrate] Adding is_public column to 'questionpaper' table...")
                    if engine.dialect.name == "postgresql":
                        conn.execute(_sql("ALTER TABLE questionpaper ADD COLUMN is_public BOOLEAN DEFAULT TRUE"))
                    else:
                        conn.execute(_sql("ALTER TABLE questionpaper ADD COLUMN is_public BOOLEAN DEFAULT 1"))

            # Auto-migrate studycircle table
            if inspector.has_table("studycircle"):
                circle_cols = {c["name"] for c in inspector.get_columns("studycircle")}
                if "is_private" not in circle_cols:
                    print("[migrate] Adding is_private column to 'studycircle' table...")
                    is_priv_type = "BOOLEAN DEFAULT FALSE" if engine.dialect.name == "postgresql" else "BOOLEAN DEFAULT 0"
                    conn.execute(_sql(f"ALTER TABLE studycircle ADD COLUMN is_private {is_priv_type}"))
                if "target_user_id" not in circle_cols:
                    print("[migrate] Adding target_user_id column to 'studycircle' table...")
                    conn.execute(_sql("ALTER TABLE studycircle ADD COLUMN target_user_id INTEGER"))
                if "avatar_icon" not in circle_cols:
                    print("[migrate] Adding avatar_icon column to 'studycircle' table...")
                    conn.execute(_sql("ALTER TABLE studycircle ADD COLUMN avatar_icon VARCHAR DEFAULT '💬'"))

            # Auto-migrate circlemessage table
            if inspector.has_table("circlemessage"):
                msg_cols = {c["name"] for c in inspector.get_columns("circlemessage")}
                msg_additions = {
                    "message_type": "VARCHAR DEFAULT 'text'",
                    "media_url": "VARCHAR",
                    "sticker_id": "VARCHAR",
                    "capture_id": "INTEGER",
                    "capture_title": "VARCHAR",
                    "capture_summary": "TEXT",
                    "capture_kind": "VARCHAR",
                }
                for col_name, col_ddl in msg_additions.items():
                    if col_name not in msg_cols:
                        print(f"[migrate] Adding {col_name} column to 'circlemessage' table...")
                        conn.execute(_sql(f'ALTER TABLE circlemessage ADD COLUMN {col_name} {col_ddl}'))

            # Auto-migrate circlemessagereaction table
            if not inspector.has_table("circlemessagereaction"):
                print("[migrate] Creating 'circlemessagereaction' table...")
                CircleMessageReaction.__table__.create(conn)

    except Exception as e:
        print(f"[migrate] Schema migration notice: {e}")


def get_session() -> Session:
    return Session(engine)