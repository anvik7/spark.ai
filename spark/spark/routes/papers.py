import os
import uuid
from datetime import datetime, timezone

import boto3
from botocore.client import Config as BotoConfig
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlmodel import col, func, select

from ..auth import current_user
from ..models import PaperBookmark, PaperDownloadLog, PaperReport, QuestionPaper, User, get_session
from .. import subscription

router = APIRouter(prefix="/api/papers", tags=["papers"])

# --- Backblaze B2 client (S3-compatible API) --------------------------------
# B2's endpoint is region-specific — copy it exactly from your bucket's
# "Endpoint" field in the B2 dashboard (e.g. s3.us-west-004.backblazeb2.com).
# Don't guess this one; a wrong region silently fails auth.
B2_KEY_ID = os.environ.get("B2_KEY_ID", "")
B2_APPLICATION_KEY = os.environ.get("B2_APPLICATION_KEY", "")
B2_BUCKET_NAME = os.environ.get("B2_BUCKET_NAME", "spark-papers")
B2_ENDPOINT = os.environ.get("B2_ENDPOINT", "")  # full https:// URL

_storage_client = None

def _get_storage():
    global _storage_client
    if _storage_client is None:
        if not B2_ENDPOINT or not B2_KEY_ID:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Storage service is not configured. Contact support.",
            )
        _storage_client = boto3.client(
            "s3",
            endpoint_url=B2_ENDPOINT,
            aws_access_key_id=B2_KEY_ID,
            aws_secret_access_key=B2_APPLICATION_KEY,
            config=BotoConfig(signature_version="s3v4"),
        )
    return _storage_client

TIER_LIMITS = {
    "free":  {"storage_bytes": 100 * 1024 * 1024,        "max_uploads": 3,  "uploads_lifetime": True,  "max_downloads_per_month": 10},
    "pro":   {"storage_bytes": 2 * 1024 * 1024 * 1024,   "max_uploads": 30, "uploads_lifetime": False, "max_downloads_per_month": None},
    "ultra": {"storage_bytes": 10 * 1024 * 1024 * 1024,  "max_uploads": None, "uploads_lifetime": False, "max_downloads_per_month": None},
}


def _limits_for(user: User) -> dict:
    return TIER_LIMITS.get(user.plan, TIER_LIMITS["free"])


def _storage_used(session, user_id: int) -> int:
    total = session.exec(
        select(func.sum(QuestionPaper.file_size)).where(QuestionPaper.uploader_id == user_id)
    ).one()
    return total or 0


def _upload_count(session, user_id: int, lifetime: bool) -> int:
    q = select(func.count()).where(QuestionPaper.uploader_id == user_id)
    if not lifetime:
        start_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        q = q.where(col(QuestionPaper.created_at) >= start_of_month)
    return session.exec(q).one()


def _downloads_this_month(session, user_id: int) -> int:
    start_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return session.exec(
        select(func.count()).where(
            PaperDownloadLog.user_id == user_id,
            col(PaperDownloadLog.downloaded_at) >= start_of_month,
        )
    ).one()


def _paper_out(p: QuestionPaper, user_id: int | None = None, is_saved: bool = False) -> dict:
    return {
        "id": p.id,
        "title": p.title,
        "examTag": p.exam_tag,
        "subject": p.subject,
        "category": p.category or "General",
        "resourceType": p.resource_type or "handwritten_notes",
        "language": p.language or "English",
        "difficulty": p.difficulty or "Medium",
        "year": p.year,
        "fileName": p.file_name,
        "fileSize": p.file_size,
        "downloadCount": p.download_count,
        "saveCount": p.save_count or 0,
        "reportsCount": p.reports_count or 0,
        "pageCount": p.page_count or 1,
        "uploaderId": p.uploader_id,
        "uploaderName": p.uploader_name or "Spark Learner",
        "isPublic": p.is_public,
        "extractedOcrText": p.extracted_ocr_text or "",
        "isSaved": is_saved,
        "createdAt": p.created_at.isoformat() if p.created_at else datetime.now(timezone.utc).isoformat(),
    }


LOCAL_STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage_papers")
os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)


def _store_paper_file(data: bytes, filename: str) -> tuple[str, bool]:
    """Store file via Backblaze B2 if configured, else fall back to local disk storage."""
    ext = os.path.splitext(filename or "")[1] or ".pdf"
    object_key = f"papers/{uuid.uuid4().hex}{ext}"

    if B2_ENDPOINT and B2_KEY_ID:
        try:
            _get_storage().put_object(Bucket=B2_BUCKET_NAME, Key=object_key, Body=data)
            return object_key, True
        except Exception as e:
            print(f"[papers] B2 upload error: {e}, using local fallback")

    # Local storage fallback
    local_path = os.path.join(LOCAL_STORAGE_DIR, os.path.basename(object_key))
    with open(local_path, "wb") as f:
        f.write(data)
    return local_path, False


@router.post("")
async def upload_paper(
    title: str = Form(...),
    exam_tag: str = Form(""),
    subject: str = Form(""),
    category: str = Form("General"),
    resource_type: str = Form("handwritten_notes"),
    language: str = Form("English"),
    difficulty: str = Form("Medium"),
    year: int | None = Form(None),
    is_public: bool = Form(True),
    page_count: int = Form(1),
    ocr_text: str = Form(""),
    file: UploadFile = File(...),
    user: User = Depends(current_user),
):
    assert user.id is not None
    title_clean = title.strip()
    if not title_clean:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Resource title is required.")

    with get_session() as session:
        data = await file.read()
        size = len(data)

        if size > 50 * 1024 * 1024:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "File size must be under 50MB.")

        ok, msg = subscription.check_upload_quota(session, user, size)
        if not ok:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, msg)

        file_path, _ = _store_paper_file(data, file.filename or "document.pdf")

        extracted_text = ocr_text.strip()
        if not extracted_text and file.content_type and "image" in file.content_type:
            extracted_text = f"Handwritten Study Notes for {title_clean}. Extracted terms: {subject} {exam_tag} {category}."

        uploader_display = user.email.split("@")[0].capitalize() if user.email else "Spark Learner"

        paper = QuestionPaper(
            title=title_clean,
            exam_tag=exam_tag.strip(),
            subject=subject.strip(),
            category=category.strip(),
            resource_type=resource_type.strip(),
            language=language.strip(),
            difficulty=difficulty.strip(),
            year=year,
            is_public=is_public,
            page_count=max(1, page_count),
            extracted_ocr_text=extracted_text,
            uploader_id=user.id,
            uploader_name=uploader_display,
            file_path=file_path,
            file_name=file.filename or "paper.pdf",
            file_size=size,
        )
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return _paper_out(paper, user.id, False)


@router.get("")
def list_papers(
    tab: str = "all",
    query: str | None = None,
    category: str | None = None,
    exam_tag: str | None = None,
    subject: str | None = None,
    resource_type: str | None = None,
    language: str | None = None,
    sort_by: str = "recent",
    user: User = Depends(current_user),
):
    assert user.id is not None
    with get_session() as session:
        # User saved paper IDs
        saved_ids = set(
            session.exec(select(PaperBookmark.paper_id).where(PaperBookmark.user_id == user.id)).all()
        )

        q = select(QuestionPaper)

        # Tab filtering
        if tab == "my_uploads":
            q = q.where(QuestionPaper.uploader_id == user.id)
        elif tab == "saved":
            q = q.where(col(QuestionPaper.id).in_(saved_ids)) if saved_ids else q.where(False)
        elif tab == "handwritten":
            q = q.where(
                (QuestionPaper.is_public == True) | (QuestionPaper.uploader_id == user.id),
                QuestionPaper.resource_type == "handwritten_notes"
            )
        elif tab == "popular":
            q = q.where((QuestionPaper.is_public == True) | (QuestionPaper.uploader_id == user.id))
            q = q.order_by(col(QuestionPaper.download_count).desc())
        elif tab == "recommended":
            q = q.where((QuestionPaper.is_public == True) | (QuestionPaper.uploader_id == user.id))
            q = q.order_by(col(QuestionPaper.save_count).desc(), col(QuestionPaper.download_count).desc())
        else:
            # Default 'all' or 'recent'
            q = q.where((QuestionPaper.is_public == True) | (QuestionPaper.uploader_id == user.id))

        # Search Query Filtering (Title, Subject, Exam Tag, OCR Text)
        if query and query.strip():
            kw = f"%{query.strip().lower()}%"
            q = q.where(
                col(QuestionPaper.title).ilike(kw) |
                col(QuestionPaper.subject).ilike(kw) |
                col(QuestionPaper.exam_tag).ilike(kw) |
                col(QuestionPaper.extracted_ocr_text).ilike(kw)
            )

        if category and category.strip() and category != "All":
            q = q.where(QuestionPaper.category == category.strip())

        if exam_tag and exam_tag.strip():
            q = q.where(QuestionPaper.exam_tag == exam_tag.strip())

        if subject and subject.strip():
            q = q.where(QuestionPaper.subject == subject.strip())

        if resource_type and resource_type.strip() and resource_type != "All":
            q = q.where(QuestionPaper.resource_type == resource_type.strip())

        if language and language.strip() and language != "All":
            q = q.where(QuestionPaper.language == language.strip())

        if sort_by == "recent" and tab not in ["popular", "recommended"]:
            q = q.order_by(col(QuestionPaper.created_at).desc())

        papers = session.exec(q).all()
        return [_paper_out(p, user.id, p.id in saved_ids) for p in papers]


@router.get("/{paper_id}")
def get_paper(paper_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        paper = session.get(QuestionPaper, paper_id)
        if not paper:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found.")

        # Security check for private resource
        if not paper.is_public and paper.uploader_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This resource is private to its uploader.")

        is_saved = session.exec(
            select(PaperBookmark).where(PaperBookmark.user_id == user.id, PaperBookmark.paper_id == paper_id)
        ).first() is not None

        return _paper_out(paper, user.id, is_saved)


@router.get("/{paper_id}/download")
def download_paper(paper_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        paper = session.get(QuestionPaper, paper_id)
        if not paper:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found.")

        # Security check for private resource
        if not paper.is_public and paper.uploader_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied to private resource.")

        # Enforce exact backend download quota limits
        ok, msg = subscription.check_download_quota(session, user)
        if not ok:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, msg)

        session.add(PaperDownloadLog(user_id=user.id, paper_id=paper_id))
        paper.download_count += 1
        session.add(paper)
        session.commit()

        if paper.file_path.startswith("papers/") and B2_ENDPOINT and B2_KEY_ID:
            try:
                presigned_url = _get_storage().generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": B2_BUCKET_NAME,
                        "Key": paper.file_path,
                        "ResponseContentDisposition": f'attachment; filename="{paper.file_name}"',
                    },
                    ExpiresIn=300,
                )
                return RedirectResponse(presigned_url)
            except Exception as e:
                print(f"[papers] Presigned URL failed: {e}")

        # Local fallback download or return success metadata
        return {"download_url": f"/api/papers/{paper_id}/file", "file_name": paper.file_name}


@router.post("/{paper_id}/bookmark")
def toggle_bookmark_paper(paper_id: int, user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        paper = session.get(QuestionPaper, paper_id)
        if not paper:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found.")

        if not paper.is_public and paper.uploader_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot bookmark private resource.")

        existing = session.exec(
            select(PaperBookmark).where(PaperBookmark.user_id == user.id, PaperBookmark.paper_id == paper_id)
        ).first()

        if existing:
            session.delete(existing)
            paper.save_count = max(0, (paper.save_count or 1) - 1)
            is_saved = False
        else:
            session.add(PaperBookmark(user_id=user.id, paper_id=paper_id))
            paper.save_count = (paper.save_count or 0) + 1
            is_saved = True

        session.add(paper)
        session.commit()
        return {"id": paper_id, "isSaved": is_saved, "saveCount": paper.save_count}


@router.post("/{paper_id}/report")
def report_paper(paper_id: int, reason: str = Form("inappropriate"), details: str = Form(""), user: User = Depends(current_user)):
    assert user.id is not None
    with get_session() as session:
        paper = session.get(QuestionPaper, paper_id)
        if not paper:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found.")

        session.add(PaperReport(user_id=user.id, paper_id=paper_id, reason=reason, details=details))
        paper.reports_count = (paper.reports_count or 0) + 1
        session.add(paper)
        session.commit()
        return {"reported": True, "paper_id": paper_id, "message": "Thank you. Our moderation team has received your report."}


@router.delete("/{paper_id}")
def delete_paper(paper_id: int, user: User = Depends(current_user)):
    with get_session() as session:
        paper = session.get(QuestionPaper, paper_id)
        if not paper:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found.")
        if paper.uploader_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the uploader can delete this resource.")

        if paper.file_path.startswith("papers/") and B2_ENDPOINT and B2_KEY_ID:
            try:
                _get_storage().delete_object(Bucket=B2_BUCKET_NAME, Key=paper.file_path)
            except Exception:
                pass
        elif os.path.exists(paper.file_path):
            try:
                os.remove(paper.file_path)
            except Exception:
                pass

        # Cleanup download logs and bookmarks
        for log in session.exec(select(PaperDownloadLog).where(PaperDownloadLog.paper_id == paper_id)).all():
            session.delete(log)
        for bkm in session.exec(select(PaperBookmark).where(PaperBookmark.paper_id == paper_id)).all():
            session.delete(bkm)
        for rpt in session.exec(select(PaperReport).where(PaperReport.paper_id == paper_id)).all():
            session.delete(rpt)

        session.delete(paper)
        session.commit()
        return {"deleted": paper_id}
