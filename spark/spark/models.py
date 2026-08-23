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
    # Web users sign in with email; chat users keep channel + external_id.
    channel: str = "web"
    external_id: str = Field(index=True)            # email for web users
    email: Optional[str] = Field(default=None, index=True)
    hashed_password: Optional[str] = None
    name: str = ""
    plan: str = "free"            # "free" | "pro" | "ultra"
    plan_until: Optional[datetime] = None
    digest_hour: int = 8          # local hour for the morning digest
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Card(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True, foreign_key="user.id")
    kind: str = "text"           # text | link | image | voice | pdf | github
    raw: str = ""                # original text / url / caption / transcript
    title: str = ""             # AI-generated title
    summary: str = ""            # AI one-line summary
    tags: list = Field(default_factory=list, sa_column=Column(JSON))
    topic: str = ""             # broad domain, AI-assigned
    difficulty: int = 0         # 1-5, AI-assigned
    importance: int = 0         # 1-10, AI-assigned (drives resurfacing)
    source_type: str = "text"   # how it was captured
    source_url: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # --- spaced repetition (SM-2) ---
    ease: float = 2.5
    interval_days: int = 0
    reps: int = 0
    due_on: date = Field(default_factory=date.today, index=True)


class UsageDay(SQLModel, table=True):
    """One row per user per day to enforce free-tier AI rate limits."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    day: date = Field(default_factory=date.today, index=True)
    ai_calls: int = 0


class CardEmbedding(SQLModel, table=True):
    """Semantic-search vector for a card, stored as a JSON float list.
    Separate table so it's created automatically by create_all (no migration)."""
    card_id: int = Field(primary_key=True, foreign_key="card.id")
    vector: str = ""             # JSON-encoded list[float], L2-normalised
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

def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _migrate()


def _migrate() -> None:
    """Add knowledge-object columns that create_all won't add to an existing
    'card' table. SQLite dev only; a fresh Postgres prod DB gets them from
    create_all. Best-effort — never blocks startup."""
    from sqlalchemy import text as _sql
    cols = {
        "title": "VARCHAR DEFAULT ''",
        "topic": "VARCHAR DEFAULT ''",
        "difficulty": "INTEGER DEFAULT 0",
        "importance": "INTEGER DEFAULT 0",
        "source_type": "VARCHAR DEFAULT 'text'",
    }
    try:
        if engine.dialect.name != "sqlite":
            return
        with engine.connect() as conn:
            existing = {row[1] for row in conn.execute(_sql("PRAGMA table_info(card)"))}
            for name, ddl in cols.items():
                if name not in existing:
                    conn.execute(_sql(f"ALTER TABLE card ADD COLUMN {name} {ddl}"))

            try:
                g_existing = {row[1] for row in conn.execute(_sql("PRAGMA table_info(usergoal)"))}
                if g_existing and "active" not in g_existing:
                    conn.execute(_sql("ALTER TABLE usergoal ADD COLUMN active BOOLEAN DEFAULT 1"))
            except Exception:
                pass

            conn.commit()
    except Exception as e:
        print(f"[migrate] skipped: {e}")


def get_session() -> Session:
    return Session(engine)
