"""Data model. SQLModel over SQLite for dev; flip database_url to a Postgres
URL for production (the brief's planned migration) with no code changes."""
from datetime import datetime, date, timezone
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
    subject: str = ""
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    duration_seconds: int = 0
    was_focused: bool = False
    ambient_sound: Optional[str] = None
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
    file_path: str = ""          # R2 object key
    file_name: str = ""
    file_size: int = 0           # bytes
    download_count: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PaperDownloadLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    paper_id: int = Field(index=True, foreign_key="questionpaper.id")
    downloaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StudyCircle(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = ""
    exam_tag: str = ""
    invite_code: str = Field(index=True, unique=True)
    owner_id: int = Field(index=True, foreign_key="user.id")
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
    reply_to_id: Optional[int] = Field(default=None, foreign_key="circlemessage.id")
    is_deleted: bool = False
    edited_at: Optional[datetime] = None
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
    except Exception as e:
        print(f"[migrate] Schema migration notice: {e}")


def get_session() -> Session:
    return Session(engine)