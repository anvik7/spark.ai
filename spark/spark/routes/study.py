# spark/routes/study.py
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Field, SQLModel, select
from spark.auth import current_user
from spark.models import User, get_session

router = APIRouter(prefix="/api/study", tags=["study"])

# --- Database Models ---

class StudyLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    subject: str
    duration_minutes: int = 0
    pages_read: int = 0
    logged_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TargetGoal(SQLModel, table=True): 
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    title: str                      # e.g., "JLPT N2 Exam" or "TGPSC Paper II"
    target_date: date
    target_hours: int

# --- Input Schemas ---

class LogCreateIn(BaseModel):
    subject: str
    duration_minutes: int = 0
    pages_read: int = 0

class GoalCreateIn(BaseModel):
    title: str
    target_date: date
    target_hours: int

# --- API Endpoints ---

@router.post("/log")
def log_study_session(body: LogCreateIn, user: User = Depends(current_user)):
    with get_session() as session:
        log = StudyLog(
            user_id=user.id,
            subject=body.subject,
            duration_minutes=body.duration_minutes,
            pages_read=body.pages_read,
        )
        session.add(log)
        session.commit()
        session.refresh(log)
        return {"status": "success", "log": log}

@router.get("/analytics")
def get_study_analytics(user: User = Depends(current_user)):
    with get_session() as session:
        logs = session.exec(select(StudyLog).where(StudyLog.user_id == user.id)).all()
        
        total_minutes = sum(l.duration_minutes for l in logs)
        total_pages = sum(l.pages_read for l in logs)
        
        # Aggregate time by subject
        by_subject: dict[str, int] = {}
        for l in logs:
            by_subject[l.subject] = by_subject.get(l.subject, 0) + l.duration_minutes

        return {
            "total_hours": round(total_minutes / 60, 1),
            "total_pages": total_pages,
            "subject_breakdown": by_subject,
            "recent_logs": logs[-10:]
        }

@router.post("/goals")
def create_goal(body: GoalCreateIn, user: User = Depends(current_user)):
    with get_session() as session:
        goal = TargetGoal(
            user_id=user.id,
            title=body.title,
            target_date=body.target_date,
            target_hours=body.target_hours
        )
        session.add(goal)
        session.commit()
        session.refresh(goal)
        return goal