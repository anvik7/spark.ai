import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select, func

from ..auth import current_user
from ..models import CircleMember, StudyCircle, User, get_session

router = APIRouter(prefix="/api/circles", tags=["circles"])


def _circle_out(circle: StudyCircle, member_count: int, role: str | None = None) -> dict:
    out = {
        "id": circle.id,
        "name": circle.name,
        "description": circle.description,
        "examTag": circle.exam_tag,
        "inviteCode": circle.invite_code,
        "ownerId": circle.owner_id,
        "memberCount": member_count,
        "createdAt": circle.created_at.isoformat(),
    }
    if role is not None:
        out["myRole"] = role
    return out


@router.post("")
def create_circle(
    body: dict,
    user: User = Depends(current_user),
):
    assert user.id is not None
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Circle name is required")

    invite_code = uuid.uuid4().hex[:8]

    with get_session() as session:
        circle = StudyCircle(
            name=name,
            description=(body.get("description") or "").strip(),
            exam_tag=(body.get("exam_tag") or "").strip(),
            invite_code=invite_code,
            owner_id=user.id,
        )
        session.add(circle)
        session.commit()
        session.refresh(circle)

        # Auto-add creator as owner member
        session.add(CircleMember(circle_id=circle.id, user_id=user.id, role="owner"))
        session.commit()

        return _circle_out(circle, member_count=1, role="owner")


@router.get("")
def list_my_circles(user: User = Depends(current_user)):
    """List circles the current user belongs to."""
    assert user.id is not None
    with get_session() as session:
        memberships = session.exec(
            select(CircleMember).where(CircleMember.user_id == user.id)
        ).all()

        results = []
        for m in memberships:
            circle = session.get(StudyCircle, m.circle_id)
            if not circle:
                continue
            count = session.exec(
                select(func.count()).where(CircleMember.circle_id == circle.id)
            ).one()
            results.append(_circle_out(circle, member_count=count, role=m.role))

        return results


@router.get("/discover")
def discover_circles(exam_tag: str | None = None, user: User = Depends(current_user)):
    """Browse all circles (optionally filtered by exam_tag)."""
    with get_session() as session:
        q = select(StudyCircle)
        if exam_tag:
            q = q.where(StudyCircle.exam_tag == exam_tag)
        circles = session.exec(q.order_by(StudyCircle.created_at.desc())).all()  # type: ignore[union-attr]

        results = []
        for c in circles:
            count = session.exec(
                select(func.count()).where(CircleMember.circle_id == c.id)
            ).one()
            results.append(_circle_out(c, member_count=count))
        return results


@router.get("/{circle_id}")
def get_circle(circle_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        circle = session.get(StudyCircle, circle_id)
        if not circle:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Circle not found")
        count = session.exec(
            select(func.count()).where(CircleMember.circle_id == circle_id)
        ).one()
        membership = session.exec(
            select(CircleMember).where(
                CircleMember.circle_id == circle_id,
                CircleMember.user_id == user.id,
            )
        ).first()
        return _circle_out(circle, member_count=count, role=membership.role if membership else None)


@router.get("/{circle_id}/members")
def list_members(circle_id: int, user: User = Depends(current_user)):
    with get_session() as session:
        circle = session.get(StudyCircle, circle_id)
        if not circle:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Circle not found")
        members = session.exec(
            select(CircleMember).where(CircleMember.circle_id == circle_id)
        ).all()
        results = []
        for m in members:
            u = session.get(User, m.user_id)
            results.append({
                "userId": m.user_id,
                "name": u.name if u else "Unknown",
                "role": m.role,
                "joinedAt": m.joined_at.isoformat(),
            })
        return results


@router.post("/join")
def join_circle(body: dict, user: User = Depends(current_user)):
    assert user.id is not None
    code = (body.get("invite_code") or "").strip()
    if not code:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invite code is required")

    with get_session() as session:
        circle = session.exec(
            select(StudyCircle).where(StudyCircle.invite_code == code)
        ).first()
        if not circle:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No circle found with that invite code")

        existing = session.exec(
            select(CircleMember).where(
                CircleMember.circle_id == circle.id,
                CircleMember.user_id == user.id,
            )
        ).first()
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "You are already a member of this circle")

        session.add(CircleMember(circle_id=circle.id, user_id=user.id, role="member"))
        session.commit()

        count = session.exec(
            select(func.count()).where(CircleMember.circle_id == circle.id)
        ).one()
        return _circle_out(circle, member_count=count, role="member")


@router.delete("/{circle_id}/leave")
def leave_circle(circle_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        circle = session.get(StudyCircle, circle_id)
        if not circle:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Circle not found")

        if circle.owner_id == user.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Owner cannot leave. Delete the circle instead.")

        membership = session.exec(
            select(CircleMember).where(
                CircleMember.circle_id == circle_id,
                CircleMember.user_id == user.id,
            )
        ).first()
        if not membership:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "You are not a member of this circle")

        session.delete(membership)
        session.commit()
        return {"left": circle_id}


@router.delete("/{circle_id}")
def delete_circle(circle_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        circle = session.get(StudyCircle, circle_id)
        if not circle:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Circle not found")
        if circle.owner_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can delete this circle")

        # Remove all members first
        members = session.exec(
            select(CircleMember).where(CircleMember.circle_id == circle_id)
        ).all()
        for m in members:
            session.delete(m)
        session.delete(circle)
        session.commit()
        return {"deleted": circle_id}
