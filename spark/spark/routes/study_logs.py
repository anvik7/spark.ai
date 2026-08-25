from datetime import date as date_type, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import col, select

from ..auth import current_user
from ..models import StudySession, User, UserGoal, get_session

router = APIRouter(prefix="/api/study", tags=["study"])


class LogIn(BaseModel):
    subject: str
    minutes: int = 0
    date: str


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _log_out(l: StudySession) -> dict:
    started = _as_utc(l.started_at)
    minutes = round((l.duration_seconds or 0) / 60)
    return {
        "id": l.id,
        "subject": l.subject or "",
        "bookTitle": "",
        "minutes": minutes,
        "pagesRead": 0,
        "date": started.date().isoformat(),
        "timestamp": int(started.timestamp() * 1000),
    }


@router.post("/logs")
def create_log(body: LogIn, user: User = Depends(current_user)):
    try:
        day = date_type.fromisoformat(body.date)
    except ValueError:
        day = date_type.today()
    started_at = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    duration_seconds = max(0, body.minutes) * 60

    with get_session() as session:
        log = StudySession(
            user_id=user.id,
            subject=body.subject,
            started_at=started_at,
            ended_at=started_at + timedelta(seconds=duration_seconds),
            duration_seconds=duration_seconds,
        )
        session.add(log)
        session.commit()
        session.refresh(log)
        return _log_out(log)


@router.get("/logs")
def list_logs(user: User = Depends(current_user)):
    with get_session() as session:
        logs = session.exec(
            select(StudySession)
            .where(StudySession.user_id == user.id)
            .order_by(col(StudySession.started_at).desc())
        ).all()
        return [_log_out(l) for l in logs]


@router.get("/logs/today")
def today_stats(user: User = Depends(current_user)):
    today_str = date_type.today().isoformat()
    with get_session() as session:
        logs = session.exec(
            select(StudySession).where(StudySession.user_id == user.id)
        ).all()
        todays = [l for l in logs if _as_utc(l.started_at).date().isoformat() == today_str]

        total_minutes = sum(round((l.duration_seconds or 0) / 60) for l in todays)

        daily_goal_minutes = 0
        goal = session.exec(
            select(UserGoal).where(
                UserGoal.user_id == user.id,
                UserGoal.active == True,
                UserGoal.goal_type == "daily",
            )
        ).first()
        if goal:
            daily_goal_minutes = int(goal.target_hours * 60)

        progress_pct = (
            min(100, round(total_minutes / daily_goal_minutes * 100))
            if daily_goal_minutes > 0 else 0
        )
        return {
            "totalMinutes": total_minutes,
            "totalHours": round(total_minutes / 60, 1),
            "totalPages": 0,
            "sessions": len(todays),
            "dailyGoalMinutes": daily_goal_minutes,
            "progressPct": progress_pct,
        }


@router.get("/logs/weekly")
def weekly_stats(user: User = Depends(current_user)):
    start = date_type.today() - timedelta(days=6)
    days = [(start + timedelta(days=i)).isoformat() for i in range(7)]
    with get_session() as session:
        logs = session.exec(
            select(StudySession).where(StudySession.user_id == user.id)
        ).all()
        by_day = {d: 0 for d in days}
        for l in logs:
            d = _as_utc(l.started_at).date().isoformat()
            if d in by_day:
                by_day[d] += round((l.duration_seconds or 0) / 60)
        return [{"date": d, "minutes": by_day[d]} for d in days]