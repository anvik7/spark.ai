from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import col, select

from ..auth import current_user
from ..models import User, UserGoal, get_session

router = APIRouter(prefix="/api/goals", tags=["goals"])


class GoalIn(BaseModel):
    goal_type: str        # "daily" | "weekly"
    target_hours: float


@router.get("")
def get_active_goal(user: User = Depends(current_user)):
    with get_session() as session:
        goal = session.exec(
            select(UserGoal)
            .where(UserGoal.user_id == user.id, UserGoal.active == True)
            .order_by(col(UserGoal.created_at).desc())
        ).first()
        return goal


@router.post("")
def set_goal(payload: GoalIn, user: User = Depends(current_user)):
    with get_session() as session:
        # Deactivate any existing active goals for this user
        existing_goals = session.exec(
            select(UserGoal).where(UserGoal.user_id == user.id, UserGoal.active == True)
        ).all()
        for g in existing_goals:
            g.active = False
            session.add(g)

        # Insert new active goal
        goal = UserGoal(
            user_id=user.id,
            goal_type=payload.goal_type,
            target_hours=payload.target_hours,
            active=True,
        )
        session.add(goal)
        session.commit()
        session.refresh(goal)
        return goal
