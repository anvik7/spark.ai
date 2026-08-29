import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import col, func, select

from ..auth import current_user
from ..models import CircleMember, CircleMessage, StudyCircle, User, get_session

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


def _check_membership(session, circle_id: int, user_id: int) -> CircleMember:
    membership = session.exec(
        select(CircleMember).where(
            CircleMember.circle_id == circle_id,
            CircleMember.user_id == user_id,
        )
    ).first()
    if not membership:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Access denied: You must be a member of this circle.",
        )
    return membership


def _message_out(session, msg: CircleMessage) -> dict:
    sender = session.get(User, msg.user_id)
    reply_to = None
    if msg.reply_to_id:
        parent_msg = session.get(CircleMessage, msg.reply_to_id)
        if parent_msg:
            parent_sender = session.get(User, parent_msg.user_id)
            reply_to = {
                "id": parent_msg.id,
                "senderName": parent_sender.name if parent_sender else "Unknown",
                "content": "[Message deleted]" if parent_msg.is_deleted else parent_msg.content,
            }

    return {
        "id": msg.id,
        "circleId": msg.circle_id,
        "userId": msg.user_id,
        "senderName": sender.name if sender else "Unknown",
        "senderAvatar": getattr(sender, "avatar_url", "") or "" if sender else "",
        "content": "[Message deleted]" if msg.is_deleted else msg.content,
        "replyToId": msg.reply_to_id,
        "replyTo": reply_to,
        "isDeleted": msg.is_deleted,
        "editedAt": msg.edited_at.isoformat() if msg.edited_at else None,
        "createdAt": msg.created_at.isoformat(),
    }


# ==================== CIRCLE MANAGEMENT ENDPOINTS ====================

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
        circles = session.exec(q.order_by(col(StudyCircle.created_at).desc())).all()

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
    assert user.id is not None
    with get_session() as session:
        circle = session.get(StudyCircle, circle_id)
        if not circle:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Circle not found")
        _check_membership(session, circle_id, user.id)

        members = session.exec(
            select(CircleMember).where(CircleMember.circle_id == circle_id)
        ).all()
        results = []
        for m in members:
            u = session.get(User, m.user_id)
            results.append({
                "userId": m.user_id,
                "name": u.name if u else "Unknown",
                "avatarUrl": getattr(u, "avatar_url", "") or "" if u else "",
                "role": m.role,
                "joinedAt": m.joined_at.isoformat(),
            })
        return results


@router.post("/join")
def join_circle_by_code(body: dict, user: User = Depends(current_user)):
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


@router.post("/{circle_id}/join")
def join_circle_by_id(circle_id: int, body: dict = {}, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        circle = session.get(StudyCircle, circle_id)
        if not circle:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Circle not found")

        existing = session.exec(
            select(CircleMember).where(
                CircleMember.circle_id == circle_id,
                CircleMember.user_id == user.id,
            )
        ).first()
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "You are already a member of this circle")

        session.add(CircleMember(circle_id=circle_id, user_id=user.id, role="member"))
        session.commit()

        count = session.exec(
            select(func.count()).where(CircleMember.circle_id == circle_id)
        ).one()
        return _circle_out(circle, member_count=count, role="member")


@router.post("/{circle_id}/leave")
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

        # Delete all messages first
        messages = session.exec(
            select(CircleMessage).where(CircleMessage.circle_id == circle_id)
        ).all()
        for msg in messages:
            session.delete(msg)

        # Delete all members
        members = session.exec(
            select(CircleMember).where(CircleMember.circle_id == circle_id)
        ).all()
        for m in members:
            session.delete(m)

        session.delete(circle)
        session.commit()
        return {"deleted": circle_id}


# ==================== CHAT / MESSAGING ENDPOINTS ====================

@router.post("/{circle_id}/messages")
def send_message(circle_id: int, body: dict, user: User = Depends(current_user)):
    assert user.id is not None
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Message content cannot be empty")

    reply_to_id = body.get("reply_to_id")
    if reply_to_id is not None:
        try:
            reply_to_id = int(reply_to_id)
        except (ValueError, TypeError):
            reply_to_id = None

    with get_session() as session:
        _check_membership(session, circle_id, user.id)

        if reply_to_id:
            parent = session.get(CircleMessage, reply_to_id)
            if not parent or parent.circle_id != circle_id:
                reply_to_id = None

        msg = CircleMessage(
            circle_id=circle_id,
            user_id=user.id,
            content=content,
            reply_to_id=reply_to_id,
        )
        session.add(msg)
        session.commit()
        session.refresh(msg)

        return _message_out(session, msg)


@router.get("/{circle_id}/messages")
def list_messages(
    circle_id: int,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(current_user),
):
    assert user.id is not None
    limit = max(1, min(100, limit))
    offset = max(0, offset)

    with get_session() as session:
        _check_membership(session, circle_id, user.id)

        total = session.exec(
            select(func.count()).where(CircleMessage.circle_id == circle_id)
        ).one()

        messages = session.exec(
            select(CircleMessage)
            .where(CircleMessage.circle_id == circle_id)
            .order_by(col(CircleMessage.created_at).asc())
            .offset(offset)
            .limit(limit)
        ).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "messages": [_message_out(session, m) for m in messages],
        }


@router.put("/{circle_id}/messages/{msg_id}")
def edit_message(circle_id: int, msg_id: int, body: dict, user: User = Depends(current_user)):
    assert user.id is not None
    new_content = (body.get("content") or "").strip()
    if not new_content:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Message content cannot be empty")

    with get_session() as session:
        _check_membership(session, circle_id, user.id)

        msg = session.get(CircleMessage, msg_id)
        if not msg or msg.circle_id != circle_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")

        if msg.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own messages")

        if msg.is_deleted:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot edit a deleted message")

        msg.content = new_content
        msg.edited_at = datetime.now(timezone.utc)
        session.add(msg)
        session.commit()
        session.refresh(msg)

        return _message_out(session, msg)


@router.delete("/{circle_id}/messages/{msg_id}")
def delete_message(circle_id: int, msg_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        membership = _check_membership(session, circle_id, user.id)

        msg = session.get(CircleMessage, msg_id)
        if not msg or msg.circle_id != circle_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")

        circle = session.get(StudyCircle, circle_id)
        is_owner = (circle and circle.owner_id == user.id) or (membership.role == "owner")
        is_sender = (msg.user_id == user.id)

        if not (is_sender or is_owner):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Only the message author or circle owner can delete this message.",
            )

        # Soft delete
        msg.is_deleted = True
        msg.content = ""
        session.add(msg)
        session.commit()
        session.refresh(msg)

        return _message_out(session, msg)
