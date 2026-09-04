import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import col, func, select, delete

from ..auth import current_user
from ..models import CircleMember, CircleMessage, CircleMessageReaction, CircleMute, StudyCircle, User, UserBlock, UserReport, get_session
from ..subscription import is_active_paid, is_trial_active

router = APIRouter(prefix="/api/circles", tags=["circles"])

UPLOAD_FILES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage_media")
os.makedirs(UPLOAD_FILES_DIR, exist_ok=True)


def _circle_out(session, circle: StudyCircle, member_count: int, role: str | None = None, current_user_id: int | None = None) -> dict:
    is_private = getattr(circle, "is_private", False)
    avatar_icon = getattr(circle, "avatar_icon", "💬") or "💬"
    display_name = circle.name

    # Handle 1-to-1 private chat naming
    if is_private and getattr(circle, "target_user_id", None) and current_user_id:
        partner_id = circle.target_user_id if circle.owner_id == current_user_id else circle.owner_id
        partner = session.get(User, partner_id)
        if partner:
            display_name = partner.name or f"User #{partner.id}"
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
        
        display_content = "[Message deleted]" if latest_msg.is_deleted else latest_msg.content
        if latest_msg.message_type == "sticker":
            display_content = "Sent a sticker"
        elif latest_msg.message_type == "image":
            display_content = "Sent a photo 📷"
        elif latest_msg.message_type == "capture":
            display_content = f"Shared Capture: {latest_msg.capture_title or 'Capture Card'} 🎴"

        latest_data = {
            "content": display_content,
            "senderName": sender.name if sender else "Unknown",
            "createdAt": created_dt.isoformat(),
        }

    is_muted = False
    if current_user_id:
        muted = session.exec(
            select(CircleMute).where(CircleMute.user_id == current_user_id, CircleMute.circle_id == circle.id)
        ).first()
        is_muted = bool(muted)

    out = {
        "id": circle.id,
        "name": display_name,
        "description": circle.description,
        "examTag": circle.exam_tag,
        "inviteCode": circle.invite_code,
        "ownerId": circle.owner_id,
        "isPrivate": is_private,
        "targetUserId": circle.target_user_id,
        "avatarIcon": avatar_icon,
        "memberCount": member_count,
        "isMuted": is_muted,
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


def _get_message_reactions(session, message_id: int, current_user_id: Optional[int] = None) -> list[dict]:
    """Retrieve and aggregate reactions for a message."""
    rx_list = session.exec(
        select(CircleMessageReaction)
        .where(CircleMessageReaction.message_id == message_id)
        .order_by(col(CircleMessageReaction.created_at).asc())
    ).all()
    if not rx_list:
        return []

    grouped: dict[str, dict] = {}
    for r in rx_list:
        if r.emoji not in grouped:
            grouped[r.emoji] = {
                "emoji": r.emoji,
                "count": 0,
                "users": [],
                "reacted": False,
            }
        grouped[r.emoji]["count"] += 1
        u = session.get(User, r.user_id)
        u_name = u.name if u and u.name else f"User #{r.user_id}"
        grouped[r.emoji]["users"].append({"id": r.user_id, "name": u_name})
        if current_user_id and r.user_id == current_user_id:
            grouped[r.emoji]["reacted"] = True

    return list(grouped.values())


def _message_out(session, msg: CircleMessage, current_user_id: Optional[int] = None) -> dict:
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

    reactions = [] if msg.is_deleted else _get_message_reactions(session, msg.id, current_user_id)

    return {
        "id": msg.id,
        "circleId": msg.circle_id,
        "userId": msg.user_id,
        "senderName": sender.name if sender else "Unknown",
        "senderAvatar": getattr(sender, "avatar_url", "") or "" if sender else "",
        "content": "[Message deleted]" if msg.is_deleted else msg.content,
        "messageType": getattr(msg, "message_type", "text") or "text",
        "mediaUrl": getattr(msg, "media_url", None),
        "stickerId": getattr(msg, "sticker_id", None),
        "captureId": getattr(msg, "capture_id", None),
        "captureTitle": getattr(msg, "capture_title", None),
        "captureSummary": getattr(msg, "capture_summary", None),
        "captureKind": getattr(msg, "capture_kind", None),
        "replyToId": msg.reply_to_id,
        "replyTo": reply_to,
        "isDeleted": msg.is_deleted,
        "isEdited": bool(getattr(msg, "edited_at", None)),
        "editedAt": msg.edited_at.isoformat() if getattr(msg, "edited_at", None) else None,
        "createdAt": created_dt.isoformat(),
        "reactions": reactions,
    }


# ==================== USER SEARCH & CHAT ENDPOINTS ====================

@router.get("/users/search")
def search_users(q: str = "", user: User = Depends(current_user)):
    """Search registered users for initiating private 1-to-1 chats (without exposing email addresses)."""
    assert user.id is not None
    q_str = q.strip().lower()
    if not q_str:
        return []

    with get_session() as session:
        # Exclude blocked users
        blocked_ids = set(session.exec(
            select(UserBlock.blocked_id).where(UserBlock.blocker_id == user.id)
        ).all())
        blockers_ids = set(session.exec(
            select(UserBlock.blocker_id).where(UserBlock.blocked_id == user.id)
        ).all())
        forbidden_ids = blocked_ids.union(blockers_ids)

        users = session.exec(
            select(User)
            .where(User.id != user.id)
            .where(col(User.id).notin_(forbidden_ids))
            .where(
                (col(User.name).ilike(f"%{q_str}%")) |
                (col(User.email).ilike(f"%{q_str}%"))
            )
            .limit(20)
        ).all()

        return [
            {
                "id": u.id,
                "name": u.name or f"User #{u.id}",
                "avatarUrl": getattr(u, "avatar_url", "") or "",
            }
            for u in users
        ]


from collections import defaultdict
import time
_user_msg_timestamps = defaultdict(list)

def _check_rate_limit(user_id: int, max_per_minute: int = 30):
    now = time.time()
    cutoff = now - 60
    _user_msg_timestamps[user_id] = [t for t in _user_msg_timestamps[user_id] if t > cutoff]
    if len(_user_msg_timestamps[user_id]) >= max_per_minute:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Rate limit exceeded. Please wait a moment before sending more messages."
        )
    _user_msg_timestamps[user_id].append(now)


@router.get("/users/{target_user_id}/profile")
def get_user_public_profile(target_user_id: int, user: User = Depends(current_user)):
    """Fetch stranger/public user profile (avatar, name, public circles). NEVER exposes email address or private info."""
    assert user.id is not None
    with get_session() as session:
        target = session.get(User, target_user_id)
        if not target:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
        
        # Check if blocked
        blocked = session.exec(
            select(UserBlock).where(
                ((UserBlock.blocker_id == target_user_id) & (UserBlock.blocked_id == user.id)) |
                ((UserBlock.blocker_id == user.id) & (UserBlock.blocked_id == target_user_id))
            )
        ).first()

        memberships = session.exec(
            select(CircleMember).where(CircleMember.user_id == target_user_id)
        ).all()
        public_communities = []
        for m in memberships:
            c = session.get(StudyCircle, m.circle_id)
            if c and not c.is_private:
                public_communities.append({"id": c.id, "name": c.name, "avatarIcon": getattr(c, "avatar_icon", "🌐") or "🌐"})

        return {
            "id": target.id,
            "name": target.name or f"User #{target.id}",
            "avatarUrl": getattr(target, "avatar_url", "") or "",
            "isBlocked": bool(blocked),
            "publicCommunities": public_communities,
        }


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

@router.post("/upload-image")
async def upload_chat_image(file: UploadFile = File(...), user: User = Depends(current_user)):
    """Upload image for chat with server-side file type and 5MB size validation."""
    assert user.id is not None
    if not file:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is required.")

    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    if ext not in allowed_exts:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File format {ext} not allowed. Supported: PNG, JPG, WEBP, GIF.")

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image file size exceeds 5MB limit.")

    file_name = f"chat_{uuid.uuid4().hex[:12]}{ext}"
    dest_path = os.path.join(UPLOAD_FILES_DIR, file_name)
    with open(dest_path, "wb") as f:
        f.write(data)

    url = f"/api/circles/media/{file_name}"
    return {"url": url, "filename": file.filename, "size": len(data)}


@router.get("/media/{file_name}")
def serve_chat_media(file_name: str):
    """Serve uploaded chat image file."""
    file_path = os.path.join(UPLOAD_FILES_DIR, file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media file not found")
    return FileResponse(file_path)


@router.post("/{circle_id}/messages")
def send_message(circle_id: int, body: dict, user: User = Depends(current_user)):
    assert user.id is not None
    _check_rate_limit(user.id)
    content = (body.get("content") or "").strip()
    msg_type = (body.get("message_type") or "text").strip().lower()
    media_url = body.get("media_url")
    sticker_id = body.get("sticker_id")
    capture_id = body.get("capture_id")
    capture_title = body.get("capture_title")
    capture_summary = body.get("capture_summary")
    capture_kind = body.get("capture_kind")

    if not content and not media_url and not sticker_id and not capture_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Message content cannot be empty")

    reply_to_id = body.get("reply_to_id")
    if reply_to_id is not None:
        try:
            reply_to_id = int(reply_to_id)
        except (ValueError, TypeError):
            reply_to_id = None

    with get_session() as session:
        _check_membership(session, circle_id, user.id)

        circle = session.get(StudyCircle, circle_id)
        if circle and circle.is_private and circle.target_user_id:
            other_id = circle.target_user_id if circle.owner_id == user.id else circle.owner_id
            blocked = session.exec(
                select(UserBlock).where(
                    ((UserBlock.blocker_id == other_id) & (UserBlock.blocked_id == user.id)) |
                    ((UserBlock.blocker_id == user.id) & (UserBlock.blocked_id == other_id))
                )
            ).first()
            if blocked:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Communication is blocked between these users.")

        if reply_to_id:
            parent = session.get(CircleMessage, reply_to_id)
            if not parent or parent.circle_id != circle_id:
                reply_to_id = None

        msg = CircleMessage(
            circle_id=circle_id,
            user_id=user.id,
            content=content,
            message_type=msg_type,
            media_url=media_url,
            sticker_id=sticker_id,
            capture_id=capture_id,
            capture_title=capture_title,
            capture_summary=capture_summary,
            capture_kind=capture_kind,
            reply_to_id=reply_to_id,
        )
        session.add(msg)
        session.commit()
        session.refresh(msg)

        return _message_out(session, msg, user.id)


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
            "messages": [_message_out(session, m, user.id) for m in messages],
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

        return _message_out(session, msg, user.id)


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

        # Soft delete & cleanup reactions
        msg.is_deleted = True
        msg.content = ""
        session.exec(delete(CircleMessageReaction).where(CircleMessageReaction.message_id == msg_id))
        session.add(msg)
        session.commit()
        session.refresh(msg)

        return _message_out(session, msg, user.id)


# ==================== MESSAGE REACTIONS ENDPOINTS ====================

@router.post("/{circle_id}/messages/{msg_id}/reactions")
def toggle_message_reaction(
    circle_id: int,
    msg_id: int,
    body: dict,
    user: User = Depends(current_user)
):
    """Add, change, or remove (toggle off) a message reaction."""
    assert user.id is not None
    emoji = (body.get("emoji") or "").strip()
    if not emoji:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Emoji cannot be empty")
    if len(emoji) > 32:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Emoji exceeds maximum allowed length")

    with get_session() as session:
        _check_membership(session, circle_id, user.id)

        msg = session.get(CircleMessage, msg_id)
        if not msg or msg.circle_id != circle_id or msg.is_deleted:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found or deleted")

        existing = session.exec(
            select(CircleMessageReaction).where(
                CircleMessageReaction.message_id == msg_id,
                CircleMessageReaction.user_id == user.id,
            )
        ).first()

        action = "added"
        if existing:
            if existing.emoji == emoji:
                # Same emoji clicked again -> remove own reaction (toggle off)
                session.delete(existing)
                session.commit()
                action = "removed"
            else:
                # Different emoji clicked -> change own reaction
                existing.emoji = emoji
                existing.created_at = datetime.now(timezone.utc)
                session.add(existing)
                session.commit()
                action = "changed"
        else:
            new_rx = CircleMessageReaction(
                message_id=msg_id,
                user_id=user.id,
                emoji=emoji,
            )
            session.add(new_rx)
            session.commit()
            action = "added"

        updated_reactions = _get_message_reactions(session, msg_id, user.id)
        return {
            "ok": True,
            "action": action,
            "messageId": msg_id,
            "emoji": emoji,
            "reactions": updated_reactions,
        }


@router.delete("/{circle_id}/messages/{msg_id}/reactions")
def remove_message_reaction(
    circle_id: int,
    msg_id: int,
    user: User = Depends(current_user)
):
    """Explicitly remove own reaction from a message."""
    assert user.id is not None
    with get_session() as session:
        _check_membership(session, circle_id, user.id)

        msg = session.get(CircleMessage, msg_id)
        if not msg or msg.circle_id != circle_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")

        existing = session.exec(
            select(CircleMessageReaction).where(
                CircleMessageReaction.message_id == msg_id,
                CircleMessageReaction.user_id == user.id,
            )
        ).first()

        if existing:
            session.delete(existing)
            session.commit()

        updated_reactions = _get_message_reactions(session, msg_id, user.id)
        return {
            "ok": True,
            "action": "removed",
            "messageId": msg_id,
            "reactions": updated_reactions,
        }


# ==================== SAFETY & MODERATION ENDPOINTS ====================

@router.post("/users/{target_user_id}/block")
def block_user(target_user_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    if target_user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot block yourself.")

    with get_session() as session:
        existing = session.exec(
            select(UserBlock).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == target_user_id)
        ).first()
        if not existing:
            session.add(UserBlock(blocker_id=user.id, blocked_id=target_user_id))
            session.commit()
        return {"ok": True, "blocked_id": target_user_id}


@router.delete("/users/{target_user_id}/block")
def unblock_user(target_user_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        existing = session.exec(
            select(UserBlock).where(UserBlock.blocker_id == user.id, UserBlock.blocked_id == target_user_id)
        ).first()
        if existing:
            session.delete(existing)
            session.commit()
        return {"ok": True, "unblocked_id": target_user_id}


@router.get("/users/blocked")
def list_blocked_users(user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        blocks = session.exec(
            select(UserBlock).where(UserBlock.blocker_id == user.id)
        ).all()
        return [{"id": b.blocked_id} for b in blocks]


@router.post("/messages/{msg_id}/report")
def report_message(msg_id: int, body: dict = {}, user: User = Depends(current_user)):
    assert user.id is not None
    reason = (body.get("reason") or "inappropriate").strip()
    details = (body.get("details") or "").strip()

    with get_session() as session:
        msg = session.get(CircleMessage, msg_id)
        if not msg:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")

        report = UserReport(
            reporter_id=user.id,
            reported_user_id=msg.user_id,
            message_id=msg.id,
            reason=reason,
            details=details,
        )
        session.add(report)
        session.commit()
        return {"ok": True, "message": "Report submitted. Thank you for helping keep Spark safe."}


@router.post("/{circle_id}/mute")
def mute_circle(circle_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        _check_membership(session, circle_id, user.id)
        existing = session.exec(
            select(CircleMute).where(CircleMute.user_id == user.id, CircleMute.circle_id == circle_id)
        ).first()
        if not existing:
            session.add(CircleMute(user_id=user.id, circle_id=circle_id))
            session.commit()
        return {"ok": True, "muted": circle_id}


@router.delete("/{circle_id}/mute")
def unmute_circle(circle_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        existing = session.exec(
            select(CircleMute).where(CircleMute.user_id == user.id, CircleMute.circle_id == circle_id)
        ).first()
        if existing:
            session.delete(existing)
            session.commit()
        return {"ok": True, "unmuted": circle_id}
