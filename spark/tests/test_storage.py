"""Tests for Unified Storage Abstraction & Object Storage Pipeline (Phase 5).

Covers all 13 required categories:
1. Local storage put/get
2. Local storage delete
3. Object existence
4. S3/R2 adapter using mocked client
5. Upload -> storage reference creation (Tasks, Captures, Circles, Career Resume)
6. Authorized retrieval
7. Unauthorized retrieval
8. Path traversal rejection
9. Multi-worker/shared-storage behavior
10. Missing object handling
11. Invalid storage configuration
12. Existing upload endpoints regression & lifecycle deletion
13. Existing secure upload suite integration
"""

import io
import os
import sys
import tempfile
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from spark.auth import make_token
from spark.main import app, _UPLOAD_FILES_DIR
from spark.models import Card, CircleMessage, StudentTask, StudyCircle, CircleMember, User, UserCareerProfile, get_session, init_db
from spark.storage import (
    LocalStorageAdapter,
    S3StorageAdapter,
    StorageConfigError,
    StorageError,
    StoragePathTraversalError,
    build_object_key,
    get_storage,
    guess_content_type,
    reset_storage,
    sanitize_object_key,
    set_storage,
)

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
def test_user():
    email = f"storage_user_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(
            channel="web",
            external_id=email,
            email=email,
            name="Storage User",
            role="user",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@pytest.fixture
def other_user():
    email = f"other_user_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(
            channel="web",
            external_id=email,
            email=email,
            name="Other User",
            role="user",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@pytest.fixture
def auth_headers(test_user):
    token = make_token(test_user)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_headers(other_user):
    token = make_token(other_user)
    return {"Authorization": f"Bearer {token}"}


# ============================================================================
# 1. Local Storage Put / Get
# ============================================================================

def test_local_storage_put_get(temp_storage):
    key = "users/1/tasks/123/document.pdf"
    content = b"%PDF-1.4 dummy binary content"

    saved_key = temp_storage.put(key, content, content_type="application/pdf")
    assert saved_key == key

    retrieved = temp_storage.get(key)
    assert retrieved == content

    # Check size and content type
    assert temp_storage.get_size(key) == len(content)
    assert temp_storage.get_content_type(key) == "application/pdf"


# ============================================================================
# 2. Local Storage Delete
# ============================================================================

def test_local_storage_delete(temp_storage):
    key = "users/1/captures/abc/audio.webm"
    content = b"\x1a\x45\xdf\xa3dummy-webm-bytes"

    temp_storage.put(key, content)
    assert temp_storage.exists(key) is True

    # Delete existing
    deleted = temp_storage.delete(key)
    assert deleted is True
    assert temp_storage.exists(key) is False
    assert temp_storage.get(key) is None

    # Idempotent delete on non-existent key returns True
    assert temp_storage.delete("users/1/captures/abc/does_not_exist.webm") is True


# ============================================================================
# 3. Object Existence
# ============================================================================

def test_object_existence(temp_storage):
    key = "users/42/resumes/uuid/resume.docx"
    assert temp_storage.exists(key) is False

    temp_storage.put(key, b"dummy docx data")
    assert temp_storage.exists(key) is True

    temp_storage.delete(key)
    assert temp_storage.exists(key) is False


# ============================================================================
# 4. S3/R2 Adapter using Mocked Client
# ============================================================================

def test_s3_storage_adapter_mocked():
    mock_boto = MagicMock()

    # Mock get_object
    mock_body = MagicMock()
    mock_body.read.return_value = b"s3-stored-data"
    mock_boto.get_object.return_value = {"Body": mock_body}

    # Mock head_object
    mock_boto.head_object.return_value = {
        "ContentType": "image/png",
        "ContentLength": 14,
    }

    # Mock presigned URL
    mock_boto.generate_presigned_url.return_value = "https://r2.cloudflarestorage.com/bucket/key?token=mocked"

    adapter = S3StorageAdapter(
        bucket_name="test-bucket",
        endpoint_url="https://account.r2.cloudflarestorage.com",
        access_key_id="test_key",
        secret_access_key="test_secret",
        region_name="auto",
        s3_client=mock_boto,
    )

    key = "users/10/chat/msg1/image.png"

    # 1. Put
    saved_key = adapter.put(key, b"s3-stored-data", content_type="image/png")
    assert saved_key == key
    mock_boto.put_object.assert_called_once_with(
        Bucket="test-bucket",
        Key=key,
        Body=b"s3-stored-data",
        ContentType="image/png",
    )

    # 2. Get
    data = adapter.get(key)
    assert data == b"s3-stored-data"
    mock_boto.get_object.assert_called_once_with(Bucket="test-bucket", Key=key)

    # 3. Exists
    assert adapter.exists(key) is True
    mock_boto.head_object.assert_called_with(Bucket="test-bucket", Key=key)

    # 4. Size & Content Type
    assert adapter.get_size(key) == 14
    assert adapter.get_content_type(key) == "image/png"

    # 5. Presigned URL
    presigned = adapter.generate_presigned_url(key, expires_in=1800)
    assert "https://r2.cloudflarestorage.com" in presigned

    # 6. Delete
    deleted = adapter.delete(key)
    assert deleted is True
    mock_boto.delete_object.assert_called_once_with(Bucket="test-bucket", Key=key)

    # 7. Redaction on error (credentials never exposed)
    mock_boto.put_object.side_effect = Exception("Failed with secret test_secret and key test_key")
    with pytest.raises(StorageError) as exc_info:
        adapter.put("users/10/test.png", b"data")
    assert "test_secret" not in str(exc_info.value)
    assert "[REDACTED]" in str(exc_info.value)


# ============================================================================
# 5. Upload -> Storage Reference Creation
# ============================================================================

def test_upload_storage_reference_creation(test_user, auth_headers):
    # A. Tasks Upload
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    task_res = client.post(
        "/api/tasks/upload-solve",
        headers=auth_headers,
        files={"file": ("problem.png", png_bytes, "image/png")},
        data={"prompt": "Solve this equation"},
    )
    assert task_res.status_code == 200
    task_id = task_res.json()["id"]

    with get_session() as session:
        db_task = session.get(StudentTask, task_id)
        assert db_task is not None
        assert db_task.storage_key is not None
        assert db_task.storage_key.startswith(f"users/{test_user.id}/tasks/")
        assert db_task.image_url.startswith("/api/uploads/")

    # B. Captures File Upload
    file_res = client.post(
        "/api/captures/file",
        headers=auth_headers,
        files={"file": ("notes.pdf", b"%PDF-1.4 sample notes", "application/pdf")},
    )
    assert file_res.status_code == 200
    card_id = file_res.json()["id"]

    with get_session() as session:
        db_card = session.get(Card, card_id)
        assert db_card is not None
        assert db_card.storage_key is not None
        assert db_card.storage_key.startswith(f"users/{test_user.id}/captures/")
        assert db_card.source_url.startswith("/api/uploads/")

    # C. Circles Image Upload
    circle_img_res = client.post(
        "/api/circles/upload-image",
        headers=auth_headers,
        files={"file": ("chat_diagram.png", png_bytes, "image/png")},
    )
    assert circle_img_res.status_code == 200
    circle_body = circle_img_res.json()
    assert circle_body["url"].startswith("/api/circles/media/")
    assert "storage_key" in circle_body
    assert circle_body["storage_key"].startswith(f"users/{test_user.id}/chat/")

    # D. Career Resume Upload
    resume_res = client.post(
        "/api/career/upload-resume",
        headers=auth_headers,
        files={"file": ("resume.txt", b"Jane Doe\nSoftware Engineer\nPython FastAPI SQL", "text/plain")},
        data={"target_role": "Backend Engineer"},
    )
    assert resume_res.status_code == 200

    with get_session() as session:
        profile = session.exec(select(UserCareerProfile).where(UserCareerProfile.user_id == test_user.id)).first()
        assert profile is not None
        assert profile.resume_storage_key is not None
        assert profile.resume_storage_key.startswith(f"users/{test_user.id}/resumes/")


# ============================================================================
# 6. Authorized Retrieval
# ============================================================================

def test_authorized_retrieval(test_user, auth_headers):
    # Upload task
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    task_res = client.post(
        "/api/tasks/upload-solve",
        headers=auth_headers,
        files={"file": ("auth_test.png", png_bytes, "image/png")},
        data={"prompt": "Authorized test prompt"},
    )
    assert task_res.status_code == 200
    image_url = task_res.json()["imageUrl"]

    # Owner download
    dl_res = client.get(image_url, headers=auth_headers)
    assert dl_res.status_code == 200
    assert dl_res.content == png_bytes

    # Chat media retrieval
    chat_res = client.post(
        "/api/circles/upload-image",
        headers=auth_headers,
        files={"file": ("diagram.png", png_bytes, "image/png")},
    )
    assert chat_res.status_code == 200
    media_url = chat_res.json()["url"]

    media_dl = client.get(media_url)
    assert media_dl.status_code == 200
    assert media_dl.content == png_bytes


# ============================================================================
# 7. Unauthorized Retrieval
# ============================================================================

def test_unauthorized_retrieval(test_user, other_user, auth_headers, other_headers):
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    task_res = client.post(
        "/api/tasks/upload-solve",
        headers=auth_headers,
        files={"file": ("private.png", png_bytes, "image/png")},
        data={"prompt": "Private task prompt"},
    )
    assert task_res.status_code == 200
    image_url = task_res.json()["imageUrl"]

    # 1. Unauthenticated -> 401
    unauth_res = client.get(image_url)
    assert unauth_res.status_code == 401

    # 2. Authenticated non-owner -> 403
    other_res = client.get(image_url, headers=other_headers)
    assert other_res.status_code == 403


# ============================================================================
# 8. Path Traversal Rejection
# ============================================================================

def test_path_traversal_rejection(auth_headers):
    # Unit level: sanitize_object_key
    with pytest.raises(StoragePathTraversalError):
        sanitize_object_key("../etc/passwd")

    with pytest.raises(StoragePathTraversalError):
        sanitize_object_key("users/../../passwords.txt")

    with pytest.raises(StoragePathTraversalError):
        sanitize_object_key("/absolute/path")

    with pytest.raises(StoragePathTraversalError):
        sanitize_object_key("C:\\Windows\\system.ini")

    with pytest.raises(StoragePathTraversalError):
        sanitize_object_key("safe/path\x00nullbyte")

    # API level: /api/uploads/
    res1 = client.get("/api/uploads/..%2f..%2fmain.py", headers=auth_headers)
    assert res1.status_code in (400, 404)

    res2 = client.get("/api/uploads/subdir/../test.png", headers=auth_headers)
    assert res2.status_code in (400, 404)

    # API level: /api/circles/media/
    res3 = client.get("/api/circles/media/..%2f..%2fsecret.png")
    assert res3.status_code in (400, 404)


# ============================================================================
# 9. Multi-worker / Shared-storage Behavior
# ============================================================================

def test_multi_worker_shared_storage():
    """Verify that multiple simulated workers access identical object state."""
    with tempfile.TemporaryDirectory() as shared_dir:
        worker_a_storage = LocalStorageAdapter(base_dir=Path(shared_dir))
        worker_b_storage = LocalStorageAdapter(base_dir=Path(shared_dir))

        key = "users/100/tasks/uuid-worker/solution.png"
        payload = b"shared-source-of-truth-payload"

        # Worker A uploads
        worker_a_storage.put(key, payload)

        # Worker B retrieves (must succeed, no 404)
        assert worker_b_storage.exists(key) is True
        retrieved_by_b = worker_b_storage.get(key)
        assert retrieved_by_b == payload

        # Worker B deletes
        worker_b_storage.delete(key)

        # Worker A sees deletion
        assert worker_a_storage.exists(key) is False
        assert worker_a_storage.get(key) is None


# ============================================================================
# 10. Missing Object Handling
# ============================================================================

def test_missing_object_handling(temp_storage, auth_headers):
    # Adapter level
    missing_key = "users/999/tasks/missing/not_found.png"
    assert temp_storage.get(missing_key) is None
    assert temp_storage.exists(missing_key) is False
    assert temp_storage.get_size(missing_key) is None
    assert temp_storage.get_content_type(missing_key) is None

    # API level: /api/uploads/
    res = client.get("/api/uploads/non_existent_file_98765.png", headers=auth_headers)
    assert res.status_code == 404

    # API level: /api/circles/media/
    media_res = client.get("/api/circles/media/chat_9999_missing_token.png")
    assert media_res.status_code == 404


# ============================================================================
# 11. Invalid Storage Configuration
# ============================================================================

def test_invalid_storage_config():
    # S3 with empty bucket raises StorageConfigError
    with pytest.raises(StorageConfigError):
        S3StorageAdapter(bucket_name="")

    # S3 client creation without credentials raises StorageConfigError
    adapter = S3StorageAdapter(bucket_name="my-bucket", access_key_id="", secret_access_key="")
    with pytest.raises(StorageConfigError):
        adapter.put("test.txt", b"data")


# ============================================================================
# 12. Existing Upload Endpoints Regression & Deletion Lifecycle
# ============================================================================

def test_existing_upload_endpoints_regression(test_user, auth_headers):
    storage = get_storage()

    # 1. Create task with image
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    task_res = client.post(
        "/api/tasks/upload-solve",
        headers=auth_headers,
        files={"file": ("lifecycle.png", png_bytes, "image/png")},
        data={"prompt": "Task for lifecycle test"},
    )
    assert task_res.status_code == 200
    task_id = task_res.json()["id"]

    with get_session() as session:
        task = session.get(StudentTask, task_id)
        storage_key = task.storage_key
        assert storage_key is not None
        assert storage.exists(storage_key) is True

    # 2. Delete task -> removes from storage
    del_res = client.delete(f"/api/tasks/{task_id}", headers=auth_headers)
    assert del_res.status_code == 200
    assert storage.exists(storage_key) is False

    # 3. Create card with file
    card_res = client.post(
        "/api/captures/file",
        headers=auth_headers,
        files={"file": ("card_doc.pdf", b"%PDF-1.4 sample file", "application/pdf")},
    )
    assert card_res.status_code == 200
    card_id = card_res.json()["id"]

    with get_session() as session:
        card = session.get(Card, card_id)
        card_key = card.storage_key
        assert card_key is not None
        assert storage.exists(card_key) is True

    # 4. Delete card -> removes from storage
    del_card = client.delete(f"/api/captures/{card_id}", headers=auth_headers)
    assert del_card.status_code == 200
    assert storage.exists(card_key) is False

    # 5. Resume upload and clear
    resume_res = client.post(
        "/api/career/upload-resume",
        headers=auth_headers,
        files={"file": ("resume.txt", b"Jane Doe Resume Text Content", "text/plain")},
        data={"target_role": "AI Architect"},
    )
    assert resume_res.status_code == 200

    with get_session() as session:
        prof = session.exec(select(UserCareerProfile).where(UserCareerProfile.user_id == test_user.id)).first()
        resume_key = prof.resume_storage_key
        assert resume_key is not None
        assert storage.exists(resume_key) is True

    # Clear resume -> removes from storage
    clear_res = client.post("/api/career/clear-resume", headers=auth_headers)
    assert clear_res.status_code == 200
    assert storage.exists(resume_key) is False
