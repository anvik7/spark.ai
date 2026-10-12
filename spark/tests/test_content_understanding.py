"""Unit tests for SparkDhi Tasks Content Understanding Layer."""

import io
import zipfile
import pytest
from spark.content_understanding import (
    inspect_and_extract,
    UnsupportedFileError,
)


def test_extract_plain_text_utf8():
    content = b"Calculate the integral of 3x^2 dx from 0 to 2."
    res = inspect_and_extract(content, "problem.txt", "text/plain")
    assert res.kind == "txt"
    assert not res.is_visual
    assert "Calculate the integral" in res.text
    assert res.image_b64 is None


def test_extract_plain_text_empty():
    with pytest.raises(ValueError, match="empty"):
        inspect_and_extract(b"", "empty.txt", "text/plain")


def test_extract_image_png():
    # 1x1 minimal PNG header
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    res = inspect_and_extract(png_bytes, "math_problem.png", "image/png")
    assert res.kind == "image"
    assert res.is_visual
    assert res.image_b64 is not None
    assert res.mime_type == "image/png"


def test_extract_image_jpeg():
    # Minimal JPEG header
    jpeg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00"
    res = inspect_and_extract(jpeg_bytes, "exam_q5.jpg", "image/jpeg")
    assert res.kind == "image"
    assert res.is_visual
    assert res.mime_type == "image/jpeg"
    assert res.image_b64 is not None


def test_extract_docx_document():
    # Create in-memory minimal DOCX zip package
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        xml_content = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:body>
                <w:p><w:r><w:t>Question 1: Explain Newton's Third Law of Motion.</w:t></w:r></w:p>
                <w:p><w:r><w:t>Question 2: State its mathematical formulation.</w:t></w:r></w:p>
            </w:body>
        </w:document>"""
        zf.writestr("word/document.xml", xml_content)
    docx_bytes = buf.getvalue()

    res = inspect_and_extract(docx_bytes, "physics_assignment.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    assert res.kind == "docx"
    assert not res.is_visual
    assert "Newton's Third Law" in res.text
    assert "Question 2:" in res.text


def test_extract_unsupported_file():
    exe_bytes = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00"
    with pytest.raises(UnsupportedFileError, match="Unsupported file type"):
        inspect_and_extract(exe_bytes, "malicious.exe", "application/x-msdownload")


def test_extract_text_pdf():
    from pypdf import PdfWriter
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    pdf_bytes = buf.getvalue()

    # A blank PDF has no text and no images
    with pytest.raises(ValueError, match="no readable text or extractable page images"):
        inspect_and_extract(pdf_bytes, "blank.pdf", "application/pdf")
