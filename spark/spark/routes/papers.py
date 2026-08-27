import os
import uuid
from datetime import datetime, timezone

import boto3
from botocore.client import Config as BotoConfig
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlmodel import col, func, select

from ..auth import current_user
from ..models import PaperDownloadLog, QuestionPaper, User, get_session

router = APIRouter(prefix="/api/papers", tags=["papers"])

# --- R2 client -------------------------------------------------------------
# Reads directly from env vars, not config.py's settings object — I haven't
# seen config.py's full structure and don't want to blind-edit it. If you'd
# rather these live in settings, move them there yourself later; this works
# either way.
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "spark-papers")

_r2_client = None

def _get_r2():
    global _r2_client
    if _r2_client is None:
        if not R2_ACCOUNT_ID or not R2_ACCESS_KEY_ID:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Storage service is not configured. Contact support.",
            )
        _r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=BotoConfig(signature_version="s3v4"),
            region_name="auto",
        )
    return _r2_client

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


def _paper_out(p: QuestionPaper) -> dict:
    return {
        "id": p.id, "title": p.title, "examTag": p.exam_tag, "subject": p.subject,
        "year": p.year, "fileName": p.file_name, "fileSize": p.file_size,
        "downloadCount": p.download_count, "uploaderId": p.uploader_id,
        "createdAt": p.created_at.isoformat(),
    }


@router.post("")
async def upload_paper(
    title: str = Form(...),
    exam_tag: str = Form(""),
    subject: str = Form(""),
    year: int | None = Form(None),
    file: UploadFile = File(...),
    user: User = Depends(current_user),
):
    limits = _limits_for(user)

    with get_session() as session:
        used = _upload_count(session, user.id, limits["uploads_lifetime"])
        if limits["max_uploads"] is not None and used >= limits["max_uploads"]:
            period = "total" if limits["uploads_lifetime"] else "this month"
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                f"Upload limit reached ({limits['max_uploads']} {period}). Upgrade your plan for more.",
            )

        data = await file.read()
        size = len(data)

        storage_used = _storage_used(session, user.id)
        if storage_used + size > limits["storage_bytes"]:
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                "This upload would exceed your storage quota. Upgrade your plan or delete old files.",
            )

        ext = os.path.splitext(file.filename or "")[1] or ".pdf"
        object_key = f"papers/{uuid.uuid4().hex}{ext}"

        try:
            _get_r2().put_object(Bucket=R2_BUCKET_NAME, Key=object_key, Body=data)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Upload to storage failed: {e}")

        paper = QuestionPaper(
            title=title, exam_tag=exam_tag, subject=subject, year=year,
            uploader_id=user.id, file_path=object_key,   # now stores the R2 object key, not a local path
            file_name=file.filename or object_key, file_size=size,
        )
        session.add(paper)
        session.commit()
        session.refresh(paper)
        return _paper_out(paper)


@router.get("")
def list_papers(exam_tag: str | None = None, subject: str | None = None,
                user: User = Depends(current_user)):
    with get_session() as session:
        q = select(QuestionPaper)
        if exam_tag:
            q = q.where(QuestionPaper.exam_tag == exam_tag)
        if subject:
            q = q.where(QuestionPaper.subject == subject)
        papers = session.exec(q.order_by(col(QuestionPaper.created_at).desc())).all()
        return [_paper_out(p) for p in papers]


@router.get("/{paper_id}")
def get_paper(paper_id: int, user: User = Depends(current_user)):
    with get_session() as session:
        paper = session.get(QuestionPaper, paper_id)
        if not paper:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")
        return _paper_out(paper)


@router.get("/{paper_id}/download")
def download_paper(paper_id: int, user: User = Depends(current_user)):
    limits = _limits_for(user)
    with get_session() as session:
        paper = session.get(QuestionPaper, paper_id)
        if not paper:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")

        if limits["max_downloads_per_month"] is not None:
            count = _downloads_this_month(session, user.id)
            if count >= limits["max_downloads_per_month"]:
                raise HTTPException(
                    status.HTTP_402_PAYMENT_REQUIRED,
                    f"Download limit reached ({limits['max_downloads_per_month']}/month). Upgrade for unlimited downloads.",
                )

        try:
            presigned_url = _get_r2().generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": R2_BUCKET_NAME,
                    "Key": paper.file_path,
                    "ResponseContentDisposition": f'attachment; filename="{paper.file_name}"',
                },
                ExpiresIn=300,  # link valid 5 minutes — plenty for a redirect-triggered download
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Could not generate download link: {e}")

        session.add(PaperDownloadLog(user_id=user.id, paper_id=paper_id))
        paper.download_count += 1
        session.add(paper)
        session.commit()

        return RedirectResponse(presigned_url)


@router.delete("/{paper_id}")
def delete_paper(paper_id: int, user: User = Depends(current_user)):
    with get_session() as session:
        paper = session.get(QuestionPaper, paper_id)
        if not paper:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")
        if paper.uploader_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the uploader can delete this")

        try:
            _get_r2().delete_object(Bucket=R2_BUCKET_NAME, Key=paper.file_path)
        except Exception:
            pass  # best-effort — don't block DB cleanup if R2 delete fails

        logs = session.exec(select(PaperDownloadLog).where(PaperDownloadLog.paper_id == paper_id)).all()
        for log in logs:
            session.delete(log)
        session.delete(paper)
        session.commit()
        return {"deleted": paper_id}
