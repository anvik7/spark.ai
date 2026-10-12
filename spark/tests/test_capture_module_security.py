"""Focused regression and security tests for Capture (Cards) module:
1. Public capture attachment authorization & private attachment protection.
2. Upload validation (size limits, extension allowlist, magic byte verification).
3. Safe media deletion (deduplication & fault tolerance).
4. Capture API aliases (PATCH /api/captures/{id}).
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from spark.auth import make_token
from spark.main import app, _UPLOAD_FILES_DIR
from spark.models import Card, User, get_session, init_db
from spark.storage import LocalStorageAdapter, get_storage, set_storage

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()


@pytest.fixture
def temp_storage():
    """Isolated local storage adapter."""
    with tempfile.TemporaryDirectory() as tmpdir:
        adapter = LocalStorageAdapter(base_dir=Path(tmpdir))
        old_adapter = get_storage()
        set_storage(adapter)
        yield adapter
        set_storage(old_adapter)


@pytest.fixture
def user_a():
    email = f"cap_user_a_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(channel="web", external_id=email, email=email, name="Capture User A", role="user")
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@pytest.fixture
def user_b():
    email = f"cap_user_b_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(channel="web", external_id=email, email=email, name="Capture User B", role="user")
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


# ============================================================================
# FIX 1: Attachment Authorization Tests
# ============================================================================

def test_owner_can_retrieve_private_attachment(temp_storage, user_a, headers_a):
    """Owner can retrieve their private capture attachment."""
    pdf_bytes = b"%PDF-1.4 sample valid pdf content"
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("lecture.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 200
    card_data = res.json()
    source_url = card_data["source_url"]

    # Owner retrieves with token
    get_res = client.get(source_url, headers=headers_a)
    assert get_res.status_code == 200
    assert get_res.content == pdf_bytes


def test_non_owner_denied_access_to_private_attachment(temp_storage, user_a, headers_a, headers_b):
    """Non-owner is denied access (403) to a private capture attachment."""
    pdf_bytes = b"%PDF-1.4 confidential notes"
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("confidential.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 200
    source_url = res.json()["source_url"]

    # User B tries to fetch User A's private file
    get_res = client.get(source_url, headers=headers_b)
    assert get_res.status_code == 403


def test_unauthenticated_visitor_can_retrieve_public_capture_attachment(temp_storage, user_a, headers_a):
    """Unauthenticated visitor CAN retrieve attachment if the capture is explicitly public."""
    pdf_bytes = b"%PDF-1.4 public syllabus"
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("syllabus.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 200
    card_id = res.json()["id"]
    source_url = res.json()["source_url"]

    # Share the card publicly
    share_res = client.post(f"/api/captures/{card_id}/share", headers=headers_a)
    assert share_res.status_code == 200
    assert share_res.json()["is_public"] is True

    # Unauthenticated visitor fetches attachment
    anon_res = client.get(source_url)
    assert anon_res.status_code == 200
    assert anon_res.content == pdf_bytes


def test_unauthenticated_visitor_denied_access_to_private_capture(temp_storage, user_a, headers_a):
    """Unauthenticated visitor is rejected (401) when attempting to access a private capture attachment."""
    pdf_bytes = b"%PDF-1.4 strictly private document"
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("private.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 200
    source_url = res.json()["source_url"]

    # Unauthenticated visitor fetches private attachment
    anon_res = client.get(source_url)
    assert anon_res.status_code == 401


def test_path_traversal_and_invalid_filenames_rejected(headers_a):
    """Path traversal and malformed filenames return 400 Bad Request."""
    res1 = client.get("/api/uploads/..%2f..%2fetc%2fpasswd", headers=headers_a)
    assert res1.status_code in (400, 404)

    res2 = client.get("/api/uploads/folder/nested.png", headers=headers_a)
    assert res2.status_code in (400, 404)

    res3 = client.get("/api/uploads/..%5cwindows%5cwin.ini", headers=headers_a)
    assert res3.status_code in (400, 404)


# ============================================================================
# FIX 3: Upload Validation Tests
# ============================================================================

def test_oversized_upload_rejected(temp_storage, headers_a):
    """Uploads exceeding 15MB are rejected with 400 Bad Request without loading everything into memory."""
    huge_data = b"X" * (15 * 1024 * 1024 + 50)
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("huge.txt", huge_data, "text/plain")},
    )
    assert res.status_code == 400
    assert "exceeds 15MB" in res.json().get("detail", "") or "exceeds 15MB" in str(res.json())


def test_unsupported_extension_rejected(temp_storage, headers_a):
    """Unsupported or executable extensions (.exe, .html, .sh) are rejected with 400."""
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("payload.exe", b"MZ\x90\x00executable", "application/x-msdownload")},
    )
    assert res.status_code == 400
    assert "not supported" in str(res.json())


def test_mime_magic_mismatch_rejected(temp_storage, headers_a):
    """File extension claiming to be PDF but having invalid magic bytes is rejected."""
    fake_pdf = b"NOT_A_PDF_CONTENT"
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("spoofed.pdf", fake_pdf, "application/pdf")},
    )
    assert res.status_code == 400
    assert "Invalid PDF" in str(res.json())


def test_valid_image_upload_succeeds(temp_storage, headers_a):
    """Valid image upload with correct magic bytes succeeds."""
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("chart.png", png_bytes, "image/png")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["kind"] == "image"
    assert data["source_url"].startswith("/api/uploads/file_")


# ============================================================================
# FIX 4: Safe Media Deletion Tests
# ============================================================================

def test_delete_card_removes_unreferenced_media(temp_storage, user_a, headers_a):
    """Deleting a card deletes its unreferenced media from storage."""
    storage = get_storage()
    pdf_bytes = b"%PDF-1.4 disposable document"
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("disposable.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 200
    card_id = res.json()["id"]

    with get_session() as session:
        card = session.get(Card, card_id)
        assert card is not None
        storage_key = card.storage_key
        assert storage.exists(storage_key) is True

    # Delete card
    del_res = client.delete(f"/api/captures/{card_id}", headers=headers_a)
    assert del_res.status_code == 200

    # Media must be removed
    assert storage.exists(storage_key) is False


def test_delete_card_preserves_shared_media(temp_storage, user_a, headers_a):
    """If another card references the same storage key, deleting one card preserves the media."""
    storage = get_storage()
    pdf_bytes = b"%PDF-1.4 shared document"
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("shared.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 200
    c1_id = res.json()["id"]

    with get_session() as session:
        c1 = session.get(Card, c1_id)
        storage_key = c1.storage_key
        # Create a second card referencing the identical storage key
        c2 = Card(
            user_id=user_a.id,
            kind="pdf",
            title="Referencing Card",
            storage_key=storage_key,
            source_url=c1.source_url,
        )
        session.add(c2)
        session.commit()
        session.refresh(c2)
        c2_id = c2.id

    assert storage.exists(storage_key) is True

    # Delete c1
    del_1 = client.delete(f"/api/captures/{c1_id}", headers=headers_a)
    assert del_1.status_code == 200

    # Media MUST still exist because c2 references it
    assert storage.exists(storage_key) is True

    # Delete c2
    del_2 = client.delete(f"/api/captures/{c2_id}", headers=headers_a)
    assert del_2.status_code == 200

    # Now media is cleanly deleted
    assert storage.exists(storage_key) is False


def test_delete_card_handles_storage_failure_gracefully(temp_storage, user_a, headers_a):
    """Storage deletion errors report a warning without failing the card database deletion."""
    pdf_bytes = b"%PDF-1.4 fault tolerant document"
    res = client.post(
        "/api/captures/file",
        headers=headers_a,
        files={"file": ("fault.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 200
    card_id = res.json()["id"]

    with patch.object(temp_storage, "delete", side_effect=RuntimeError("Storage connection failed")):
        del_res = client.delete(f"/api/captures/{card_id}", headers=headers_a)
        assert del_res.status_code == 200
        data = del_res.json()
        assert data["deleted"] == card_id
        assert "storage_warning" in data
        assert "Storage delete error" in data["storage_warning"]

    # Verify card was removed from DB
    with get_session() as session:
        assert session.get(Card, card_id) is None


# ============================================================================
# FIX 5: Capture API Alias Tests
# ============================================================================

def test_patch_captures_alias_works(headers_a):
    """PATCH /api/captures/{card_id} acts as an alias to update_card."""
    create_res = client.post(
        "/api/captures",
        headers=headers_a,
        json={"kind": "note", "raw": "Initial content", "title": "Old Title"},
    )
    assert create_res.status_code == 200
    card_id = create_res.json()["id"]

    # Update via /api/captures/{card_id}
    patch_res = client.patch(
        f"/api/captures/{card_id}",
        headers=headers_a,
        json={"title": "Updated Title via Alias", "raw": "Updated note content"},
    )
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["title"] == "Updated Title via Alias"
    assert data["raw"] == "Updated note content"
