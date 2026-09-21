"""Regression and security tests for GET /api/uploads/{filename} endpoint."""

import os
import sys
import uuid
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlmodel import select
from spark.main import app, _UPLOAD_FILES_DIR
from spark.models import User, Card, StudentTask, get_session, init_db
from spark.auth import make_token

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()


@pytest.fixture
def owner_user():
    email = f"owner_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(
            channel="web",
            external_id=email,
            email=email,
            name="Owner User",
            role="user",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@pytest.fixture
def other_user():
    email = f"other_{uuid.uuid4().hex[:8]}@example.com"
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
def owner_headers(owner_user):
    token = make_token(owner_user)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_headers(other_user):
    token = make_token(other_user)
    return {"Authorization": f"Bearer {token}"}


def get_error_msg(res):
    try:
        data = res.json()
        if isinstance(data, dict):
            return data.get("error", {}).get("message") or data.get("detail")
    except Exception:
        pass
    return ""


def test_unauthenticated_download_returns_401():
    """1. Unauthenticated download -> 401."""
    res = client.get("/api/uploads/some_sensitive_file.png")
    assert res.status_code == 401
    assert "Not authenticated" in get_error_msg(res) or res.json()


def test_authenticated_owner_download_succeeds(owner_user, owner_headers):
    """2. Authenticated owner download -> succeeds."""
    filename = f"task_{owner_user.id}_{uuid.uuid4().hex[:8]}.png"
    file_path = _UPLOAD_FILES_DIR / filename
    content = b"fake-task-image-content-for-owner"
    file_path.write_bytes(content)

    try:
        with get_session() as session:
            task = StudentTask(
                user_id=owner_user.id,
                title="Test Task",
                prompt="Solve this",
                image_url=f"/api/uploads/{filename}",
                solution="Done",
            )
            session.add(task)
            session.commit()

        res = client.get(f"/api/uploads/{filename}", headers=owner_headers)
        assert res.status_code == 200
        assert res.content == content
    finally:
        if file_path.exists():
            file_path.unlink()


def test_authenticated_owner_card_download_succeeds(owner_user, owner_headers):
    """2b. Authenticated owner card download -> succeeds."""
    filename = f"file_{owner_user.id}_{uuid.uuid4().hex[:8]}.pdf"
    file_path = _UPLOAD_FILES_DIR / filename
    content = b"%PDF-1.4 sample file content"
    file_path.write_bytes(content)

    try:
        with get_session() as session:
            card = Card(
                user_id=owner_user.id,
                kind="file",
                title="Test Doc",
                source_url=f"/api/uploads/{filename}",
            )
            session.add(card)
            session.commit()

        res = client.get(f"/api/uploads/{filename}", headers=owner_headers)
        assert res.status_code == 200
        assert res.content == content
    finally:
        if file_path.exists():
            file_path.unlink()


def test_authenticated_non_owner_download_denied(owner_user, other_headers):
    """3. Authenticated non-owner download -> denied (403)."""
    filename = f"task_{owner_user.id}_{uuid.uuid4().hex[:8]}.png"
    file_path = _UPLOAD_FILES_DIR / filename
    content = b"private-sensitive-task-data"
    file_path.write_bytes(content)

    try:
        with get_session() as session:
            task = StudentTask(
                user_id=owner_user.id,
                title="Private Task",
                prompt="Private prompt",
                image_url=f"/api/uploads/{filename}",
                solution="Private solution",
            )
            session.add(task)
            session.commit()

        # Non-owner requests the owner's file
        res = client.get(f"/api/uploads/{filename}", headers=other_headers)
        assert res.status_code == 403
        assert get_error_msg(res) == "Access denied"
    finally:
        if file_path.exists():
            file_path.unlink()


def test_missing_file_returns_safe_404(owner_headers):
    """4. Missing file -> safe 404 error."""
    res = client.get("/api/uploads/non_existent_file_12345.png", headers=owner_headers)
    assert res.status_code == 404
    assert get_error_msg(res) == "File not found"


def test_path_traversal_attempt_denied(owner_headers):
    """5. Path traversal attempt -> denied (400 or 404)."""
    # Direct traversal syntax
    res1 = client.get("/api/uploads/..%2f..%2fmain.py", headers=owner_headers)
    assert res1.status_code in (400, 404)

    res2 = client.get("/api/uploads/..%5c..%5cmain.py", headers=owner_headers)
    assert res2.status_code in (400, 404)

    res3 = client.get("/api/uploads/subdir/../test.png", headers=owner_headers)
    assert res3.status_code in (400, 404)


def test_absolute_escaped_path_attempt_denied(owner_headers):
    """6. Absolute/escaped path attempt -> denied (400 or 404)."""
    res1 = client.get("/api/uploads/%2Fetc%2Fpasswd", headers=owner_headers)
    assert res1.status_code in (400, 404)

    res2 = client.get("/api/uploads/C:%5CWindows%5Cwin.ini", headers=owner_headers)
    assert res2.status_code in (400, 404)


def test_existing_legitimate_authenticated_download_still_works(owner_headers, other_headers):
    """7. Existing legitimate authenticated download behavior -> still works."""
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    files = {"file": ("legit_question.png", png_bytes, "image/png")}
    data = {"prompt": "Solve this equation step-by-step"}

    # Upload through legitimate pipeline
    res_upload = client.post("/api/tasks/upload-solve", headers=owner_headers, files=files, data=data)
    assert res_upload.status_code == 200
    upload_body = res_upload.json()
    image_url = upload_body["imageUrl"]
    assert image_url.startswith("/api/uploads/")
    filename = image_url.replace("/api/uploads/", "")

    # 1. Unauthenticated download of new file -> 401
    res_unauth = client.get(image_url)
    assert res_unauth.status_code == 401

    # 2. Authenticated owner download -> 200
    res_owner = client.get(image_url, headers=owner_headers)
    assert res_owner.status_code == 200
    assert res_owner.content == png_bytes

    # 3. Authenticated non-owner download -> 403
    res_other = client.get(image_url, headers=other_headers)
    assert res_other.status_code == 403
