"""Regression and security tests for complete user profile picture support:
1. Authenticated avatar upload (PNG, JPEG, WEBP, GIF).
2. Input validation: size limit (5MB), disallowed formats, empty files, magic bytes.
3. Avatar replacement with safe cleanup of previous file.
4. Avatar deletion (revert to default).
5. Persona preset selection via JSON.
6. Authorization checks: unauthenticated requests rejected, no client-supplied user ID trusted.
7. Safe public/cross-user avatar retrieval without leaking private captures or tasks.
"""

import io
import tempfile
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from spark.auth import make_token
from spark.main import app
from spark.models import Card, User, get_session, init_db
from spark.storage import LocalStorageAdapter, get_storage, set_storage

client = TestClient(app)

# Minimal valid magic bytes for image formats
VALID_PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
VALID_JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00\xff\xd9"
VALID_GIF = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x01D\x00;"


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()


@pytest.fixture
def temp_storage():
    """Isolated local storage adapter for test environment."""
    with tempfile.TemporaryDirectory() as tmpdir:
        adapter = LocalStorageAdapter(base_dir=Path(tmpdir))
        old_adapter = get_storage()
        set_storage(adapter)
        yield adapter
        set_storage(old_adapter)


@pytest.fixture
def user_a():
    email = f"avatar_a_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(channel="web", external_id=email, email=email, name="Avatar User A", role="user")
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@pytest.fixture
def user_b():
    email = f"avatar_b_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(channel="web", external_id=email, email=email, name="Avatar User B", role="user")
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def test_avatar_upload_png_success(temp_storage, user_a):
    token = make_token(user_a)
    headers = {"Authorization": f"Bearer {token}"}

    files = {"file": ("my_avatar.png", io.BytesIO(VALID_PNG), "image/png")}
    res = client.post("/api/me/avatar", headers=headers, files=files)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["avatar_url"].startswith("/api/uploads/avatar_")

    filename = data["avatar_url"].split("/api/uploads/")[-1]
    assert temp_storage.exists(filename)


def test_avatar_upload_jpeg_success(temp_storage, user_a):
    token = make_token(user_a)
    headers = {"Authorization": f"Bearer {token}"}

    files = {"file": ("photo.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    res = client.post("/api/me/avatar", headers=headers, files=files)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["avatar_url"].startswith("/api/uploads/avatar_")


def test_avatar_preset_selection(temp_storage, user_a):
    token = make_token(user_a)
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post("/api/me/avatar", headers=headers, json={"avatar_url": "preset-5"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["avatar_url"] == "preset-5"


def test_avatar_replacement_cleans_up_old_file(temp_storage, user_a):
    token = make_token(user_a)
    headers = {"Authorization": f"Bearer {token}"}

    # Upload first avatar
    files_1 = {"file": ("first.png", io.BytesIO(VALID_PNG), "image/png")}
    res_1 = client.post("/api/me/avatar", headers=headers, files=files_1)
    assert res_1.status_code == 200
    first_url = res_1.json()["avatar_url"]
    first_fn = first_url.split("/api/uploads/")[-1]
    assert temp_storage.exists(first_fn)

    # Upload second avatar
    files_2 = {"file": ("second.jpg", io.BytesIO(VALID_JPEG), "image/jpeg")}
    res_2 = client.post("/api/me/avatar", headers=headers, files=files_2)
    assert res_2.status_code == 200
    second_url = res_2.json()["avatar_url"]
    second_fn = second_url.split("/api/uploads/")[-1]
    assert second_fn != first_fn
    assert temp_storage.exists(second_fn)
    # Old file cleaned up
    assert not temp_storage.exists(first_fn)


def test_avatar_delete_reverts_to_default(temp_storage, user_a):
    token = make_token(user_a)
    headers = {"Authorization": f"Bearer {token}"}

    # Upload avatar
    files = {"file": ("pic.png", io.BytesIO(VALID_PNG), "image/png")}
    res = client.post("/api/me/avatar", headers=headers, files=files)
    assert res.status_code == 200
    fn = res.json()["avatar_url"].split("/api/uploads/")[-1]
    assert temp_storage.exists(fn)

    # Delete avatar
    del_res = client.delete("/api/me/avatar", headers=headers)
    assert del_res.status_code == 200, del_res.text
    assert del_res.json()["avatar_url"] == ""
    # File removed from storage
    assert not temp_storage.exists(fn)


def test_avatar_upload_rejects_oversized_file(temp_storage, user_a):
    token = make_token(user_a)
    headers = {"Authorization": f"Bearer {token}"}

    # 5MB + 1 byte
    oversized = VALID_PNG + (b"\x00" * (5 * 1024 * 1024 + 2))
    files = {"file": ("large.png", io.BytesIO(oversized), "image/png")}
    res = client.post("/api/me/avatar", headers=headers, files=files)
    assert res.status_code == 400
    assert "exceeds 5MB" in res.text


def test_avatar_upload_rejects_empty_file(temp_storage, user_a):
    token = make_token(user_a)
    headers = {"Authorization": f"Bearer {token}"}

    files = {"file": ("empty.png", io.BytesIO(b""), "image/png")}
    res = client.post("/api/me/avatar", headers=headers, files=files)
    assert res.status_code == 400
    assert "empty" in res.text.lower()


def test_avatar_upload_rejects_unsupported_extension(temp_storage, user_a):
    token = make_token(user_a)
    headers = {"Authorization": f"Bearer {token}"}

    files = {"file": ("malicious.exe", io.BytesIO(b"MZfake"), "application/octet-stream")}
    res = client.post("/api/me/avatar", headers=headers, files=files)
    assert res.status_code == 400
    assert "not allowed" in res.text.lower()


def test_avatar_upload_rejects_spoofed_magic_bytes(temp_storage, user_a):
    token = make_token(user_a)
    headers = {"Authorization": f"Bearer {token}"}

    # Named .png but text header
    files = {"file": ("spoofed.png", io.BytesIO(b"Plain text disguise"), "image/png")}
    res = client.post("/api/me/avatar", headers=headers, files=files)
    assert res.status_code == 400
    assert "header does not match" in res.text.lower()


def test_unauthenticated_cannot_update_or_delete_avatar(temp_storage):
    files = {"file": ("test.png", io.BytesIO(VALID_PNG), "image/png")}
    res = client.post("/api/me/avatar", files=files)
    assert res.status_code in (401, 403)

    del_res = client.delete("/api/me/avatar")
    assert del_res.status_code in (401, 403)

    # Explicit invalid Bearer token produces 401
    bad_headers = {"Authorization": "Bearer invalid.token.123"}
    bad_res = client.post("/api/me/avatar", headers=bad_headers, files=files)
    assert bad_res.status_code == 401


def test_user_cannot_alter_another_user_avatar(temp_storage, user_a, user_b):
    token_b = make_token(user_b)
    headers = {"Authorization": f"Bearer {token_b}"}

    # User B posts with user_a's ID in payload/form
    files = {"file": ("test.png", io.BytesIO(VALID_PNG), "image/png")}
    res = client.post("/api/me/avatar", headers=headers, files=files, data={"user_id": str(user_a.id)})
    assert res.status_code == 200

    # User B's avatar updated, User A's avatar untouched
    with get_session() as session:
        db_a = session.get(User, user_a.id)
        db_b = session.get(User, user_b.id)
        assert db_b.avatar_url is not None
        assert db_a.avatar_url is None


def test_avatar_retrieval_by_other_users_and_public(temp_storage, user_a, user_b):
    token_a = make_token(user_a)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Upload avatar for user A
    files = {"file": ("public_pic.png", io.BytesIO(VALID_PNG), "image/png")}
    res = client.post("/api/me/avatar", headers=headers_a, files=files)
    assert res.status_code == 200
    avatar_url = res.json()["avatar_url"]

    # 1. Unauthenticated request to /api/uploads/{filename} succeeds
    pub_res = client.get(avatar_url)
    assert pub_res.status_code == 200
    assert pub_res.content == VALID_PNG

    # 2. User B (different user) request to /api/uploads/{filename} succeeds
    token_b = make_token(user_b)
    headers_b = {"Authorization": f"Bearer {token_b}"}
    b_res = client.get(avatar_url, headers=headers_b)
    assert b_res.status_code == 200
    assert b_res.content == VALID_PNG

    # 3. Dedicated safe endpoint GET /api/users/{user_id}/avatar succeeds for User B and public
    endpoint_res_pub = client.get(f"/api/users/{user_a.id}/avatar")
    assert endpoint_res_pub.status_code == 200
    assert endpoint_res_pub.content == VALID_PNG

    endpoint_res_b = client.get(f"/api/users/{user_a.id}/avatar", headers=headers_b)
    assert endpoint_res_b.status_code == 200
    assert endpoint_res_b.content == VALID_PNG


def test_avatar_retrieval_does_not_expose_private_card_files(temp_storage, user_a, user_b):
    # Store a private capture attachment for User A
    token = uuid.uuid4().hex[:12]
    private_fn = f"file_{user_a.id}_{token}.png"
    temp_storage.put(private_fn, VALID_PNG, content_type="image/png")

    with get_session() as session:
        card = Card(
            user_id=user_a.id,
            kind="image",
            raw="Private notes",
            source_url=f"/api/uploads/{private_fn}",
            storage_key=private_fn,
            is_public=False,
        )
        session.add(card)
        session.commit()

    # Unauthenticated request to private card file MUST be rejected with 401
    pub_res = client.get(f"/api/uploads/{private_fn}")
    assert pub_res.status_code == 401

    # User B request to private card file MUST be rejected with 403
    token_b = make_token(user_b)
    b_res = client.get(f"/api/uploads/{private_fn}", headers={"Authorization": f"Bearer {token_b}"})
    assert b_res.status_code == 403
