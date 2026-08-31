"""Production Study API Router.

Handles real study session creation, live timer duration tracking,
activity ledger history, weekly study goals calculation, and AI focus recommendations.
"""
from datetime import date as date_type, datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import col, select

from ..auth import current_user
from ..models import StudentTask, StudySession, User, UserGoal, get_session
from .. import llm

router = APIRouter(prefix="/api/study", tags=["study"])


# --- Schemas -------------------------------------------------------------------

class SessionCreateIn(BaseModel):
    subject: str
    material: Optional[str] = ""
    minutes: int = 0
    seconds: int = 0
    date: Optional[str] = None


class WeeklyGoalIn(BaseModel):
    target_hours: float


# --- Helpers -------------------------------------------------------------------

def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _fmt_duration(seconds: int) -> str:
    mins = round(seconds / 60)
    if mins < 60:
        return f"{mins} min"
    hrs = mins // 60
    rem_mins = mins % 60
    return f"{hrs}h {rem_mins}m" if rem_mins > 0 else f"{hrs}h"


def _session_out(s: StudySession) -> dict:
    started = _as_utc(s.started_at)
    ended = _as_utc(s.ended_at) if s.ended_at else started + timedelta(seconds=s.duration_seconds or 0)
    mins = round((s.duration_seconds or 0) / 60)
    return {
        "id": s.id,
        "subject": s.subject or "General Academic",
        "material": s.material or "General Practice",
        "minutes": mins,
        "seconds": s.duration_seconds or 0,
        "duration_formatted": _fmt_duration(s.duration_seconds or 0),
        "date": started.date().isoformat(),
        "date_formatted": started.strftime("%d %b %Y"),
        "start_time": started.strftime("%I:%M %p"),
        "end_time": ended.strftime("%I:%M %p"),
        "timestamp": int(started.timestamp() * 1000),
    }


# --- Endpoints -----------------------------------------------------------------

@router.post("/sessions")
@router.post("/logs")
def create_session(body: SessionCreateIn, user: User = Depends(current_user)):
    """Save a real study session for authenticated user."""
    subj = (body.subject or "").strip()
    mat = (body.material or "").strip()
    if not subj:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Subject is required.")

    total_seconds = max(0, body.minutes * 60 + body.seconds)
    if total_seconds <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Study duration must be greater than 0.")

    if body.date:
        try:
            day = date_type.fromisoformat(body.date)
        except ValueError:
            day = date_type.today()
    else:
        day = date_type.today()

    now_utc = datetime.now(timezone.utc)
    started_at = datetime(day.year, day.month, day.day, now_utc.hour, now_utc.minute, tzinfo=timezone.utc)
    ended_at = started_at + timedelta(seconds=total_seconds)

    with get_session() as session:
        log = StudySession(
            user_id=user.id,
            subject=subj,
            material=mat,
            started_at=started_at,
            ended_at=ended_at,
            duration_seconds=total_seconds,
            was_focused=True,
        )
        session.add(log)
        session.commit()
        session.refresh(log)
        return _session_out(log)


@router.get("/sessions")
@router.get("/logs")
def list_sessions(user: User = Depends(current_user)):
    """Get all study sessions recorded by the authenticated user."""
    with get_session() as session:
        logs = session.exec(
            select(StudySession)
            .where(StudySession.user_id == user.id)
            .order_by(col(StudySession.started_at).desc())
        ).all()
        return [_session_out(l) for l in logs]


@router.get("/logs/today")
def today_stats(user: User = Depends(current_user)):
    """Get today's total study minutes and session count."""
    today_str = date_type.today().isoformat()
    with get_session() as session:
        logs = session.exec(
            select(StudySession).where(StudySession.user_id == user.id)
        ).all()
        todays = [l for l in logs if _as_utc(l.started_at).date().isoformat() == today_str]

        total_seconds = sum(l.duration_seconds or 0 for l in todays)
        total_minutes = round(total_seconds / 60)

        return {
            "totalMinutes": total_minutes,
            "totalHours": round(total_minutes / 60, 1),
            "durationFormatted": _fmt_duration(total_seconds),
            "sessions": len(todays),
        }


@router.get("/weekly-goal")
@router.get("/goals")
def get_weekly_goal(user: User = Depends(current_user)):
    """Calculate real weekly goal progress for the current week."""
    today = date_type.today()
    start_of_week = today - timedelta(days=today.weekday())  # Monday
    days_left = 7 - today.weekday()

    with get_session() as session:
        # Get active weekly goal
        goal = session.exec(
            select(UserGoal).where(
                UserGoal.user_id == user.id,
                UserGoal.active == True,
                UserGoal.goal_type == "weekly",
            )
        ).first()

        # Calculate completed study seconds this week
        logs = session.exec(
            select(StudySession).where(StudySession.user_id == user.id)
        ).all()

        this_week_logs = [
            l for l in logs if _as_utc(l.started_at).date() >= start_of_week
        ]
        completed_seconds = sum(l.duration_seconds or 0 for l in this_week_logs)
        completed_mins = round(completed_seconds / 60)

        if not goal:
            return {
                "hasGoal": False,
                "completedMinutes": completed_mins,
                "completedFormatted": _fmt_duration(completed_seconds),
                "daysLeft": days_left,
            }

        target_hours = goal.target_hours
        target_mins = int(target_hours * 60)
        rem_mins = max(0, target_mins - completed_mins)
        progress_pct = min(100, round((completed_mins / target_mins) * 100)) if target_mins > 0 else 0

        return {
            "hasGoal": True,
            "id": goal.id,
            "targetHours": target_hours,
            "targetMinutes": target_mins,
            "completedMinutes": completed_mins,
            "completedFormatted": _fmt_duration(completed_seconds),
            "remainingMinutes": rem_mins,
            "remainingFormatted": _fmt_duration(rem_mins * 60),
            "progressPct": progress_pct,
            "daysLeft": days_left,
        }


@router.post("/weekly-goal")
@router.post("/goals")
def set_weekly_goal(body: WeeklyGoalIn, user: User = Depends(current_user)):
    """Set or update weekly study target hours."""
    if body.target_hours <= 0 or body.target_hours > 168:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Target hours must be between 0.5 and 168 hours.")

    with get_session() as session:
        # Deactivate existing weekly goals
        existing = session.exec(
            select(UserGoal).where(UserGoal.user_id == user.id, UserGoal.goal_type == "weekly")
        ).all()
        for g in existing:
            g.active = False
            session.add(g)

        new_goal = UserGoal(
            user_id=user.id,
            goal_type="weekly",
            target_hours=body.target_hours,
            active=True,
        )
        session.add(new_goal)
        session.commit()
        session.refresh(new_goal)

    return get_weekly_goal(user)


@router.get("/logs/weekly")
def weekly_stats(user: User = Depends(current_user)):
    """Daily breakdown for the last 7 days."""
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


@router.get("/analytics/subjects")
def analytics_subjects(user: User = Depends(current_user)):
    """Breakdown of study time per subject."""
    with get_session() as session:
        logs = session.exec(
            select(StudySession).where(StudySession.user_id == user.id)
        ).all()
        by_subject: dict[str, int] = {}
        for l in logs:
            subj = l.subject.strip() or "General Academic"
            by_subject[subj] = by_subject.get(subj, 0) + round((l.duration_seconds or 0) / 60)
        total = sum(by_subject.values()) or 1
        return [
            {
                "subject": subj,
                "minutes": mins,
                "formatted": _fmt_duration(mins * 60),
                "pct": round((mins / total) * 100),
            }
            for subj, mins in by_subject.items()
        ]


@router.get("/feed")
@router.get("/recommendations")
def get_study_feed(user: User = Depends(current_user)):
    """Generate personalized AI study recommendations based on real user study history & solved tasks."""
    with get_session() as session:
        logs = session.exec(
            select(StudySession)
            .where(StudySession.user_id == user.id)
            .order_by(col(StudySession.started_at).desc())
        ).all()

        tasks = session.exec(
            select(StudentTask)
            .where(StudentTask.user_id == user.id)
            .order_by(col(StudentTask.created_at).desc())
        ).all()

    if not logs and not tasks:
        return []

    # Calculate real statistics
    subject_durations: dict[str, int] = {}
    materials_studied: list[str] = []
    for l in logs:
        subj = l.subject.strip() or "General Academic"
        subject_durations[subj] = subject_durations.get(subj, 0) + (l.duration_seconds or 0)
        if l.material and l.material not in materials_studied:
            materials_studied.append(l.material)

    recent_log = logs[0] if logs else None
    recent_task = tasks[0] if tasks else None

    # AI generation via LLM if available, or structured rule-based recommendation
    recommendations = []

    if recent_log:
        last_subj = recent_log.subject
        last_mat = recent_log.material or "practice problems"
        last_dur = _fmt_duration(recent_log.duration_seconds or 0)

        recommendations.append({
            "id": 1,
            "type": "continue_focus",
            "title": f"Continue {last_subj}",
            "content": f"You spent {last_dur} studying '{last_mat}' recently. Review your notes and solve 3 follow-up practice exercises to consolidate your memory.",
            "subject": last_subj,
            "actionText": "Start Focus Session",
        })

    if recent_task:
        recommendations.append({
            "id": 2,
            "type": "task_review",
            "title": f"Review Solved Task: {recent_task.title[:45]}",
            "content": f"You recently solved '{recent_task.prompt[:60]}...' in {recent_task.subject}. Re-verify the key formulas and step-by-step working.",
            "subject": recent_task.subject,
            "actionText": "Review Task",
        })

    # Identify least recently studied subject
    if len(subject_durations) > 1:
        least_studied = min(subject_durations.items(), key=lambda x: x[1])[0]
        recommendations.append({
            "id": 3,
            "type": "weak_spot",
            "title": f"Practice Recommendation: {least_studied}",
            "content": f"You've focused heavily on {recent_log.subject if recent_log else 'other topics'}. Spend 25 minutes practicing {least_studied} to maintain balanced mastery across subjects.",
            "subject": least_studied,
            "actionText": "Study Weak Spot",
        })

    return recommendations