"""Integration tests for Tasks Content Understanding upload pipeline."""

import io
import os
import sys
import zipfile
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlmodel import select
from spark.main import app
from spark.models import User, get_session, init_db
from spark.auth import make_token

client = TestClient(app)


@pytest.fixture
def auth_header():
    import uuid
    init_db()
    email = f"student_tasks_{uuid.uuid4().hex[:8]}@example.com"
    with get_session() as session:
        user = User(
            channel="web",
            external_id=email,
            email=email,
            name="Tasks Test Student",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        token = make_token(user)
    return {"Authorization": f"Bearer {token}"}


def test_upload_image_tasks_pipeline(auth_header):
    # Minimal 1x1 PNG bytes
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    files = {"file": ("question.png", png_bytes, "image/png")}
    data = {"prompt": "Solve question 1 from this image"}

    res = client.post("/api/tasks/upload-solve", headers=auth_header, files=files, data=data)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["imageUrl"] is not None
    assert body["imageUrl"].startswith("/api/uploads/task_")
    assert body["solution"]


def test_upload_txt_tasks_pipeline(auth_header):
    txt_bytes = b"Problem: Solve 4x - 8 = 12 step-by-step."
    files = {"file": ("math.txt", txt_bytes, "text/plain")}
    data = {"prompt": "Please explain the algebraic working"}

    res = client.post("/api/tasks/upload-solve", headers=auth_header, files=files, data=data)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["solution"]
    assert "math.txt" in body["prompt"] or "4x - 8 = 12" in body["prompt"]


def test_upload_docx_tasks_pipeline(auth_header):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body><w:p><w:r><w:t>What is the time complexity of Merge Sort?</w:t></w:r></w:p></w:body>
        </w:document>"""
        zf.writestr("word/document.xml", xml)

    files = {"file": ("algo.docx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    res = client.post("/api/tasks/upload-solve", headers=auth_header, files=files, data={"prompt": "Answer in detail"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["solution"]


def test_upload_text_pdf_tasks_pipeline(auth_header):
    raw_pdf = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
        b"4 0 obj<</Length 85>>stream\nBT /F1 12 Tf 50 250 Td (Question: Solve the quadratic equation x^2 - 5x + 6 = 0) Tj ET\nendstream\nendobj\n"
        b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n"
        b"0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000222 00000 n \n"
        b"0000000356 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n428\n%%EOF\n"
    )
    files = {"file": ("exam.pdf", raw_pdf, "application/pdf")}
    res = client.post("/api/tasks/upload-solve", headers=auth_header, files=files, data={"prompt": "Solve this equation"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["solution"]
    assert "quadratic equation" in body["prompt"] or "x^2 - 5x + 6" in body["prompt"]


def test_upload_unsupported_file_rejection(auth_header):
    bad_bytes = b"BINARY_EXECUTABLE_BYTES_DATA"
    files = {"file": ("program.exe", bad_bytes, "application/octet-stream")}
    res = client.post("/api/tasks/upload-solve", headers=auth_header, files=files, data={"prompt": "Run this"})
    assert res.status_code == 400
    assert "Unsupported file type" in res.text
