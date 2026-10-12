"""Regression and authorization tests for Chat (Circles) media serving and deletion."""

import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from spark.auth import make_token
from spark.main import app
from spark.models import CircleMember, CircleMessage, StudyCircle, User, get_session, init_db
from spark.storage import LocalStorageAdapter, get_storage, set_storage

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()


@pytest.fixture
def temp_storage():
    """Create an isolated LocalStorageAdapter backed by a temporary directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        adapter = LocalStorageAdapter(base_dir=Path(tmpdir))
        old_adapter = get_storage()
        set_storage(adapter)
        yield adapter
        set_storage(old_adapter)


@pytest.fixture
def user_a():
    email = f"chat_user_a_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(channel="web", external_id=email, email=email, name="Chat User A", role="user")
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@pytest.fixture
def user_b():
    email = f"chat_user_b_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(channel="web", external_id=email, email=email, name="Chat User B", role="user")
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@pytest.fixture
def user_c():
    email = f"chat_user_c_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(channel="web", external_id=email, email=email, name="Chat User C", role="user")
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@pytest.fixture
def headers_a(user_a):
    return {"Authorization": f"Bearer {make_token(user_a)}"}


@pytest.fixture
def headers_b(user_b):
    return {"Authorization": f"Bearer {make_token(user_b)}"}


@pytest.fixture
def headers_c(user_c):
    return {"Authorization": f"Bearer {make_token(user_c)}"}


def _upload_chat_png(user_headers, filename="photo.png"):
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    res = client.post(
        "/api/circles/upload-image",
        headers=user_headers,
        files={"file": (filename, png_bytes, "image/png")},
    )
    assert res.status_code == 200
    data = res.json()
    return data["url"], data["storage_key"], png_bytes


# ============================================================================
# Media Authorization Tests (Requirements 1 - 5)
# ============================================================================

def test_1_unauthenticated_request_is_rejected(temp_storage, user_a, headers_a):
    """1. Unauthenticated request to /api/circles/media/{filename} returns 401."""
    media_url, _, _ = _upload_chat_png(headers_a)
    res = client.get(media_url)
    assert res.status_code == 401
    assert "Not authenticated" in res.text or res.status_code == 401


def test_2_non_member_cannot_retrieve_circle_media(temp_storage, user_a, user_b, user_c, headers_a, headers_b, headers_c):
    """2. Non-member (user_c) cannot retrieve private media from a circle between user_a and user_b."""
    # Create private circle with user_a and user_b
    circle_res = client.post(
        "/api/circles",
        headers=headers_a,
        json={"name": "Private Duo", "is_private": False},  # Group circle
    )
    cid = circle_res.json()["id"]

    # Member user_b joins
    client.post(f"/api/circles/{cid}/join", headers=headers_b)

    # User_a uploads and posts image
    media_url, storage_key, png_bytes = _upload_chat_png(headers_a)
    msg_res = client.post(
        f"/api/circles/{cid}/messages",
        headers=headers_a,
        json={"content": "Confidential chart", "message_type": "image", "media_url": media_url},
    )
    assert msg_res.status_code == 200

    # User_c (outsider / non-member) tries to download media
    res_c = client.get(media_url, headers=headers_c)
    assert res_c.status_code == 403
    assert "Access denied" in res_c.text


def test_3_authorized_member_can_retrieve_valid_media(temp_storage, user_a, user_b, headers_a, headers_b):
    """3. Authorized members (both sender and other circle member) can retrieve media."""
    circle_res = client.post(
        "/api/circles",
        headers=headers_a,
        json={"name": "Study Group", "is_private": False},
    )
    cid = circle_res.json()["id"]

    client.post(f"/api/circles/{cid}/join", headers=headers_b)

    media_url, _, png_bytes = _upload_chat_png(headers_a)
    client.post(
        f"/api/circles/{cid}/messages",
        headers=headers_a,
        json={"content": "Notes photo", "message_type": "image", "media_url": media_url},
    )

    # Sender (user_a) can download
    res_a = client.get(media_url, headers=headers_a)
    assert res_a.status_code == 200
    assert res_a.content == png_bytes

    # Fellow member (user_b) can download
    res_b = client.get(media_url, headers=headers_b)
    assert res_b.status_code == 200
    assert res_b.content == png_bytes


def test_4_invalid_or_nonexistent_media_is_handled_safely(temp_storage, headers_a):
    """4. Nonexistent media or path traversal attempts return appropriate 404 or 400."""
    # Nonexistent file returns 404
    res_missing = client.get("/api/circles/media/chat_9999_missingtoken.png", headers=headers_a)
    assert res_missing.status_code == 404

    # Traversal characters return 400
    res_trav = client.get("/api/circles/media/..%2f..%2fsecret.png", headers=headers_a)
    assert res_trav.status_code in (400, 404)


def test_5_one_circle_member_cannot_access_another_circles_private_media(temp_storage, user_a, user_b, user_c, headers_a, headers_b, headers_c):
    """5. Members of Circle 1 cannot access media sent in Circle 2 if they aren't in Circle 2."""
    # Circle 1: user_a and user_b
    c1 = client.post("/api/circles", headers=headers_a, json={"name": "Circle 1"}).json()["id"]
    client.post(f"/api/circles/{c1}/join", headers=headers_b)

    # Circle 2: user_c only
    c2 = client.post("/api/circles", headers=headers_c, json={"name": "Circle 2"}).json()["id"]

    # User_c posts image in Circle 2
    media_url_c2, _, _ = _upload_chat_png(headers_c)
    client.post(
        f"/api/circles/{c2}/messages",
        headers=headers_c,
        json={"content": "Private to Circle 2", "message_type": "image", "media_url": media_url_c2},
    )

    # User_b (member of Circle 1, but NOT Circle 2) tries to access Circle 2's media
    res_b = client.get(media_url_c2, headers=headers_b)
    assert res_b.status_code == 403


# ============================================================================
# Circle Deletion & Media Cleanup Tests (Requirements 6 - 10)
# ============================================================================

def test_6_associated_media_is_deleted_when_safe(temp_storage, user_a, headers_a):
    """6. Associated media objects in StorageAdapter are deleted when Circle is deleted."""
    storage = get_storage()

    c = client.post("/api/circles", headers=headers_a, json={"name": "Disposable Circle"}).json()["id"]
    media_url, storage_key, _ = _upload_chat_png(headers_a)

    client.post(
        f"/api/circles/{c}/messages",
        headers=headers_a,
        json={"content": "Disposable image", "message_type": "image", "media_url": media_url},
    )
    assert storage.exists(storage_key) is True

    # Delete circle
    del_res = client.delete(f"/api/circles/{c}", headers=headers_a)
    assert del_res.status_code == 200

    # Storage file must be deleted
    assert storage.exists(storage_key) is False


def test_7_messages_and_db_relationships_remain_consistent(temp_storage, user_a, headers_a):
    """7. Deleting a circle cleans up CircleMessage and CircleMember records cleanly."""
    c = client.post("/api/circles", headers=headers_a, json={"name": "Consistency Circle"}).json()["id"]
    media_url, _, _ = _upload_chat_png(headers_a)

    m = client.post(
        f"/api/circles/{c}/messages",
        headers=headers_a,
        json={"content": "Image message", "message_type": "image", "media_url": media_url},
    ).json()["id"]

    # Delete circle
    client.delete(f"/api/circles/{c}", headers=headers_a)

    with get_session() as session:
        assert session.get(StudyCircle, c) is None
        assert session.get(CircleMessage, m) is None
        members = session.exec(select(CircleMember).where(CircleMember.circle_id == c)).all()
        assert len(members) == 0


def test_8_missing_storage_keys_do_not_crash_deletion(temp_storage, user_a, headers_a):
    """8. Circle with text-only messages or missing storage keys deletes without error."""
    c = client.post("/api/circles", headers=headers_a, json={"name": "Text Circle"}).json()["id"]
    client.post(f"/api/circles/{c}/messages", headers=headers_a, json={"content": "Plain text 1"})
    client.post(f"/api/circles/{c}/messages", headers=headers_a, json={"content": "Plain text 2"})

    del_res = client.delete(f"/api/circles/{c}", headers=headers_a)
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] == c


def test_9_storage_deletion_failures_are_handled_safely(temp_storage, user_a, headers_a):
    """9. If storage deletion encounters an exception, it does not crash or leave DB in inconsistent state."""
    c = client.post("/api/circles", headers=headers_a, json={"name": "Fault Tolerant Circle"}).json()["id"]
    media_url, storage_key, _ = _upload_chat_png(headers_a)

    client.post(
        f"/api/circles/{c}/messages",
        headers=headers_a,
        json={"content": "Image", "message_type": "image", "media_url": media_url},
    )

    # Patch storage.delete to raise an exception
    with patch.object(temp_storage, "delete", side_effect=RuntimeError("Storage connection blip")):
        del_res = client.delete(f"/api/circles/{c}", headers=headers_a)
        assert del_res.status_code == 200

    with get_session() as session:
        assert session.get(StudyCircle, c) is None


def test_10_media_referenced_by_another_record_is_not_accidentally_deleted(temp_storage, user_a, headers_a):
    """10. If media storage_key is also referenced by another message, do not delete the physical file."""
    storage = get_storage()

    c1 = client.post("/api/circles", headers=headers_a, json={"name": "Circle Alpha"}).json()["id"]
    c2 = client.post("/api/circles", headers=headers_a, json={"name": "Circle Beta"}).json()["id"]

    media_url, storage_key, _ = _upload_chat_png(headers_a)

    # Post message in c1
    client.post(
        f"/api/circles/{c1}/messages",
        headers=headers_a,
        json={"content": "Shared image in c1", "message_type": "image", "media_url": media_url},
    )

    # Post message in c2 pointing to the same media
    client.post(
        f"/api/circles/{c2}/messages",
        headers=headers_a,
        json={"content": "Shared image in c2", "message_type": "image", "media_url": media_url},
    )

    assert storage.exists(storage_key) is True

    # Delete c1
    client.delete(f"/api/circles/{c1}", headers=headers_a)

    # File must still exist because c2's message still references it!
    assert storage.exists(storage_key) is True

    # Delete c2
    client.delete(f"/api/circles/{c2}", headers=headers_a)

    # Now that no records reference it, file is deleted
    assert storage.exists(storage_key) is False


# ============================================================================
# Individual Message Deletion Tests (Requirements 11 - 15)
# ============================================================================

def test_11_individual_message_deletion_cleans_up_media(temp_storage, user_a, headers_a):
    """11. Deleting an individual message deletes unreferenced media from storage."""
    storage = get_storage()
    c = client.post("/api/circles", headers=headers_a, json={"name": "Single Msg Circle"}).json()["id"]
    media_url, storage_key, _ = _upload_chat_png(headers_a)

    msg_id = client.post(
        f"/api/circles/{c}/messages",
        headers=headers_a,
        json={"content": "Delete me", "message_type": "image", "media_url": media_url},
    ).json()["id"]

    assert storage.exists(storage_key) is True

    # Delete the single message
    del_res = client.delete(f"/api/circles/{c}/messages/{msg_id}", headers=headers_a)
    assert del_res.status_code == 200
    res_data = del_res.json()
    assert res_data["isDeleted"] is True

    # Storage object must be removed
    assert storage.exists(storage_key) is False


def test_12_individual_message_deletion_shared_media_preserved(temp_storage, user_a, headers_a):
    """12. Deleting a message does not delete media if another message still references it."""
    storage = get_storage()
    c = client.post("/api/circles", headers=headers_a, json={"name": "Shared Msg Circle"}).json()["id"]
    media_url, storage_key, _ = _upload_chat_png(headers_a)

    m1 = client.post(
        f"/api/circles/{c}/messages",
        headers=headers_a,
        json={"content": "Image 1", "message_type": "image", "media_url": media_url},
    ).json()["id"]

    m2 = client.post(
        f"/api/circles/{c}/messages",
        headers=headers_a,
        json={"content": "Image 2 (clone)", "message_type": "image", "media_url": media_url},
    ).json()["id"]

    assert storage.exists(storage_key) is True

    # Delete message 1
    del_1 = client.delete(f"/api/circles/{c}/messages/{m1}", headers=headers_a)
    assert del_1.status_code == 200

    # Media must still exist in storage because m2 references it
    assert storage.exists(storage_key) is True

    # Delete message 2
    del_2 = client.delete(f"/api/circles/{c}/messages/{m2}", headers=headers_a)
    assert del_2.status_code == 200

    # Now media should be cleaned up
    assert storage.exists(storage_key) is False


def test_13_individual_message_deletion_storage_failure_handled(temp_storage, user_a, headers_a):
    """13. If storage deletion fails on message delete, failure is reported in response and logged without crashing."""
    c = client.post("/api/circles", headers=headers_a, json={"name": "Failure Tol Circle"}).json()["id"]
    media_url, storage_key, _ = _upload_chat_png(headers_a)

    msg_id = client.post(
        f"/api/circles/{c}/messages",
        headers=headers_a,
        json={"content": "Failure test", "message_type": "image", "media_url": media_url},
    ).json()["id"]

    with patch.object(temp_storage, "delete", side_effect=RuntimeError("Storage connection broken")):
        del_res = client.delete(f"/api/circles/{c}/messages/{msg_id}", headers=headers_a)
        assert del_res.status_code == 200
        data = del_res.json()
        assert data["isDeleted"] is True
        assert "storage_warning" in data
        assert "Storage delete failure" in data["storage_warning"]


def test_14_individual_message_deletion_missing_storage_key_safe(temp_storage, user_a, headers_a):
    """14. Deleting a text-only message or message with missing storage key succeeds without error."""
    c = client.post("/api/circles", headers=headers_a, json={"name": "Text Only Circle"}).json()["id"]
    msg_id = client.post(
        f"/api/circles/{c}/messages",
        headers=headers_a,
        json={"content": "Just text"},
    ).json()["id"]

    del_res = client.delete(f"/api/circles/{c}/messages/{msg_id}", headers=headers_a)
    assert del_res.status_code == 200
    assert del_res.json()["isDeleted"] is True


def test_15_authenticated_image_retrieval_flow(temp_storage, user_a, user_b, headers_a, headers_b):
    """15. Authenticated fetching retrieves valid image bytes; missing/invalid tokens are rejected."""
    c = client.post("/api/circles", headers=headers_a, json={"name": "Fetch Test Circle"}).json()["id"]
    media_url, storage_key, raw_bytes = _upload_chat_png(headers_a)

    client.post(
        f"/api/circles/{c}/messages",
        headers=headers_a,
        json={"content": "Image msg", "message_type": "image", "media_url": media_url},
    )

    # 1. Without Bearer header: 401
    no_auth = client.get(media_url)
    assert no_auth.status_code == 401

    # 2. With invalid Bearer header: 401
    bad_auth = client.get(media_url, headers={"Authorization": "Bearer invalid.jwt.token"})
    assert bad_auth.status_code == 401

    # 3. With non-member user: 403
    forbidden = client.get(media_url, headers=headers_b)
    assert forbidden.status_code == 403

    # 4. With authorized member: 200 with raw image bytes
    success = client.get(media_url, headers=headers_a)
    assert success.status_code == 200
    assert success.content == raw_bytes
    assert "image/png" in success.headers.get("content-type", "")
