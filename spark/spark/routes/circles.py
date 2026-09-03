import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import col, func, select

from ..auth import current_user
from ..models import CircleMember, CircleMessage, StudyCircle, User, get_session

from ..subscription import is_active_paid, is_trial_active

router = APIRouter(prefix="/api/circles", tags=["circles"])


def _circle_out(session, circle: StudyCircle, member_count: int, role: str | None = None, current_user_id: int | None = None) -> dict:
    is_private = getattr(circle, "is_private", False)
    avatar_icon = getattr(circle, "avatar_icon", "💬") or "💬"
    display_name = circle.name

    # Handle 1-to-1 private chat naming
    if is_private and getattr(circle, "target_user_id", None) and current_user_id:
        partner_id = circle.target_user_id if circle.owner_id == current_user_id else circle.owner_id
        partner = session.get(User, partner_id)
        if partner:
            display_name = partner.name or partner.email or f"User #{partner.id}"
            avatar_icon = getattr(partner, "avatar_url", "👤") or "👤"

    # Fetch latest message
    latest_msg = session.exec(
        select(CircleMessage)
        .where(CircleMessage.circle_id == circle.id)
        .order_by(col(CircleMessage.created_at).desc())
    ).first()

    latest_data = None
    if latest_msg:
        sender = session.get(User, latest_msg.user_id)
        created_dt = getattr(latest_msg, "created_at", None) or datetime.now(timezone.utc)
        if not created_dt.tzinfo:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        latest_data = {
            "content": "[Message deleted]" if latest_msg.is_deleted else latest_msg.content,
            "senderName": sender.name if sender else "Unknown",
            "createdAt": created_dt.isoformat(),
        }

    out = {
        "id": circle.id,
        "name": display_name,
        "description": circle.description,
        "examTag": circle.exam_tag,
        "inviteCode": circle.invite_code,
        "ownerId": circle.owner_id,
        "isPrivate": is_private,
        "avatarIcon": avatar_icon,
        "memberCount": member_count,
        "latestMessage": latest_data,
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
            "Access denied: You must be a member of this conversation.",
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

    created_dt = getattr(msg, "created_at", None) or datetime.now(timezone.utc)
    if not created_dt.tzinfo:
        created_dt = created_dt.replace(tzinfo=timezone.utc)

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
        "createdAt": created_dt.isoformat(),
    }


# ==================== USER SEARCH & CHAT ENDPOINTS ====================

@router.get("/users/search")
def search_users(q: str = "", user: User = Depends(current_user)):
    """Search registered users for initiating private 1-to-1 chats."""
    assert user.id is not None
    q_str = q.strip().lower()
    if not q_str:
        return []

    with get_session() as session:
        users = session.exec(
            select(User)
            .where(User.id != user.id)
            .where(
                (col(User.name).ilike(f"%{q_str}%")) |
                (col(User.email).ilike(f"%{q_str}%"))
            )
            .limit(20)
        ).all()

        return [
            {
                "id": u.id,
                "name": u.name or u.email or f"User #{u.id}",
                "email": u.email,
                "avatarUrl": getattr(u, "avatar_url", "") or "",
            }
            for u in users
        ]


# ==================== CIRCLE / COMMUNITY MANAGEMENT ====================

@router.post("")
def create_circle(
    body: dict,
    user: User = Depends(current_user),
):
    assert user.id is not None
    name = (body.get("name") or "").strip()
    is_private = bool(body.get("is_private", False))
    target_user_id = body.get("target_user_id")
    avatar_icon = (body.get("avatar_icon") or ("🔒" if is_private else "🌐")).strip()

    if not name and not target_user_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Name or target user is required")

    with get_session() as session:
        # STRICT BACKEND ENTITLEMENT ENFORCEMENT FOR PRIVATE CHATS/GROUPS
        if is_private:
            paid_ok = is_active_paid(user) or is_trial_active(user)
            if not paid_ok:
                raise HTTPException(
                    status.HTTP_402_PAYMENT_REQUIRED,
                    detail="Private Chat is a premium feature. Keep public Spark conversations free. Upgrade to connect privately."
                )

        if target_user_id:
            target_user = session.get(User, int(target_user_id))
            if not target_user:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Target user not found")
            if not name:
                name = target_user.name or target_user.email or f"Chat with User #{target_user.id}"

            # Check if 1-to-1 private chat already exists between user and target
            existing_c = session.exec(
                select(StudyCircle)
                .where(StudyCircle.is_private == True)
                .where(
                    ((StudyCircle.owner_id == user.id) & (StudyCircle.target_user_id == int(target_user_id))) |
                    ((StudyCircle.owner_id == int(target_user_id)) & (StudyCircle.target_user_id == user.id))
                )
            ).first()
            if existing_c:
                count = session.exec(select(func.count()).where(CircleMember.circle_id == existing_c.id)).one()
                return _circle_out(session, existing_c, member_count=count, role="member", current_user_id=user.id)

        invite_code = uuid.uuid4().hex[:8]

        circle = StudyCircle(
            name=name,
            description=(body.get("description") or "").strip(),
            exam_tag=(body.get("exam_tag") or "General").strip(),
            invite_code=invite_code,
            owner_id=user.id,
            is_private=is_private,
            target_user_id=int(target_user_id) if target_user_id else None,
            avatar_icon=avatar_icon,
        )
        session.add(circle)
        session.commit()
        session.refresh(circle)

        # Auto-add creator
        session.add(CircleMember(circle_id=circle.id, user_id=user.id, role="owner"))

        # If 1-to-1 chat, auto-add target user
        if target_user_id and int(target_user_id) != user.id:
            session.add(CircleMember(circle_id=circle.id, user_id=int(target_user_id), role="member"))

        session.commit()

        count = session.exec(select(func.count()).where(CircleMember.circle_id == circle.id)).one()
        return _circle_out(session, circle, member_count=count, role="owner", current_user_id=user.id)


@router.get("")
def list_my_circles(user: User = Depends(current_user)):
    """List public communities and private conversations the current user belongs to."""
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
            results.append(_circle_out(session, circle, member_count=count, role=m.role, current_user_id=user.id))

        return results


@router.get("/discover")
def discover_circles(category: str | None = None, user: User = Depends(current_user)):
    """Browse public communities (is_private == False). FREE for all users."""
    with get_session() as session:
        q = select(StudyCircle).where(StudyCircle.is_private == False)
        if category:
            q = q.where(StudyCircle.exam_tag == category)
        circles = session.exec(q.order_by(col(StudyCircle.created_at).desc())).all()

        results = []
        for c in circles:
            count = session.exec(
                select(func.count()).where(CircleMember.circle_id == c.id)
            ).one()
            results.append(_circle_out(session, c, member_count=count, current_user_id=user.id))
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
        return _circle_out(session, circle, member_count=count, role=membership.role if membership else None, current_user_id=user.id)


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
        return _circle_out(session, circle, member_count=count, role="member", current_user_id=user.id)


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
        return _circle_out(session, circle, member_count=count, role="member", current_user_id=user.id)


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
