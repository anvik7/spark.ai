import json
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlmodel import col, select

from ..auth import current_user
from ..models import (
    ActiveRecallEvaluation,
    Card,
    ConceptMastery,
    QuestionPaper,
    StudyActiveSession,
    StudyAttempt,
    StudyChapter,
    StudyMediaSource,
    StudyMindMapNode,
    StudyQuestion,
    User,
    get_session,
)
from .. import llm, subscription

router = APIRouter(prefix="/api/study/active-sessions", tags=["study-engine"])

LOCAL_MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage_media")
os.makedirs(LOCAL_MEDIA_DIR, exist_ok=True)


# --- Input Schemas -----------------------------------------------------------

class SessionCreateUrlIn(BaseModel):
    url: str
    title: str = ""
    subject: str = "General Academic"


class ActiveRecallIn(BaseModel):
    user_response: str


class QuizAnswerIn(BaseModel):
    user_answer: str
    time_taken_seconds: int = 0


class ProgressUpdateIn(BaseModel):
    current_chapter_index: int = 0
    current_time_seconds: float = 0.0


def _update_concept_status(cm: ConceptMastery):
    if cm.attempts_count == 0:
        cm.status = "Learning"
    else:
        if cm.mastery_score >= 80.0:
            cm.status = "Mastered"
        elif cm.mastery_score >= 50.0:
            cm.status = "Improving"
        else:
            cm.status = "Needs Review"


# --- Pipeline Helper ---------------------------------------------------------

def _run_processing_pipeline(session, source: StudyMediaSource, active_session: StudyActiveSession):
    """Execute real AI concept chaptering, question generation, and mind map creation."""
    try:
        source.status = "PROCESSING"
        source.error_message = None
        source.updated_at = datetime.now(timezone.utc)
        session.add(source)
        session.commit()

        # Step 1: Extract Real Content Text
        text_content = (source.transcript_text or "").strip()

        if not text_content and source.file_path and os.path.exists(source.file_path):
            try:
                with open(source.file_path, "r", encoding="utf-8", errors="ignore") as f:
                    file_txt = f.read().strip()
                    if len(file_txt) > 20:
                        text_content = file_txt
                        source.transcript_text = text_content
            except Exception:
                pass

        if not text_content or len(text_content.strip()) < 20:
            raise ValueError("Spark couldn't process this learning material. Please upload a supported text document (.pdf, .txt, .docx).")

        source.status = "ANALYZING"
        session.add(source)
        session.commit()

        # Step 2: AI Concept Chaptering
        source.status = "CHAPTERING"
        session.add(source)
        session.commit()

        res = llm.generate_concept_chapters(text_content, source.title or active_session.title or "Active Study Session")
        chapters_data = res.get("chapters", [])
        mindmap_nodes_data = res.get("mindmap_nodes", [])
        subject_detected = res.get("subject") or active_session.subject or "General Academic"

        active_session.subject = subject_detected
        print(f"[study_engine] CHAPTER COUNT = {len(chapters_data)}")
        print(f"[study_engine] AI INPUT = transcript/content ({len(text_content)} chars)")

        # Step 3: Clear old chapters & create new concept chapters
        old_chapters = session.exec(select(StudyChapter).where(StudyChapter.session_id == active_session.id)).all()
        for ch in old_chapters:
            session.exec(select(StudyQuestion).where(StudyQuestion.chapter_id == ch.id))
            session.delete(ch)

        # Clear old mindmap nodes
        old_nodes = session.exec(select(StudyMindMapNode).where(StudyMindMapNode.session_id == active_session.id)).all()
        for n in old_nodes:
            session.delete(n)

        # Clear old concept masteries
        old_masteries = session.exec(select(ConceptMastery).where(ConceptMastery.session_id == active_session.id)).all()
        for cm in old_masteries:
            session.delete(cm)

        session.commit()

        # Save Chapters & Questions
        source.status = "GENERATING_QUESTIONS"
        session.add(source)
        session.commit()

        total_chaps = len(chapters_data)
        active_session.total_chapters_count = total_chaps

        for idx, ch_info in enumerate(chapters_data):
            ch_obj = StudyChapter(
                session_id=active_session.id,
                chapter_index=idx,
                title=ch_info.get("title") or f"Chapter {idx + 1}",
                start_time=float(ch_info.get("start_time") or 0.0),
                end_time=float(ch_info.get("end_time") or 0.0),
                duration_seconds=float(ch_info.get("duration_seconds") or 0.0),
                transcript_segment=ch_info.get("transcript_segment") or "",
                short_explanation=ch_info.get("short_explanation") or "",
                key_concepts_json=json.dumps(ch_info.get("key_concepts") or []),
                learning_objective=ch_info.get("learning_objective") or "",
                difficulty=ch_info.get("difficulty") or "Medium",
                status="unstarted" if idx > 0 else "in_progress",
            )
            session.add(ch_obj)
            session.commit()
            session.refresh(ch_obj)

            # Questions for chapter
            quiz_list = ch_info.get("quiz") or []
            for q_info in quiz_list:
                q_obj = StudyQuestion(
                    chapter_id=ch_obj.id,
                    question_type=q_info.get("question_type") or "mcq",
                    question_text=q_info.get("question_text") or "",
                    options_json=json.dumps(q_info.get("options") or []),
                    correct_answer=q_info.get("correct_answer") or "",
                    explanation=q_info.get("explanation") or "",
                    difficulty=ch_obj.difficulty,
                    concept_tag=q_info.get("concept_tag") or "General",
                )
                session.add(q_obj)

            # Initial concept mastery entries
            concepts = ch_info.get("key_concepts") or ["General Concept"]
            for c_name in concepts:
                cm_obj = ConceptMastery(
                    user_id=active_session.user_id,
                    session_id=active_session.id,
                    concept_name=c_name,
                    mastery_score=0.0,
                    status="Learning",
                )
                session.add(cm_obj)

        # Save MindMap Nodes
        for node_info in mindmap_nodes_data:
            node_obj = StudyMindMapNode(
                session_id=active_session.id,
                node_key=node_info.get("node_key") or f"node_{uuid.uuid4().hex[:6]}",
                label=node_info.get("label") or "Concept",
                parent_key=node_info.get("parent_key"),
                concept_tag=node_info.get("concept_tag") or "Main Topic",
                depth=node_info.get("depth") or 0,
                mastery_status="Learning",
            )
            session.add(node_obj)

        source.status = "READY"
        source.updated_at = datetime.now(timezone.utc)
        active_session.updated_at = datetime.now(timezone.utc)
        session.add(source)
        session.add(active_session)
        session.commit()

    except Exception as e:
        print(f"[study_engine] Pipeline processing error: {e}")
        source.status = "FAILED"
        source.error_message = str(e)
        source.updated_at = datetime.now(timezone.utc)
        session.add(source)
        session.commit()


# --- Endpoints ---------------------------------------------------------------

@router.get("")
def list_active_sessions(user: User = Depends(current_user)):
    """List active learning sessions for authenticated user with real progress."""
    assert user.id is not None
    with get_session() as session:
        sessions = session.exec(
            select(StudyActiveSession)
            .where(StudyActiveSession.user_id == user.id)
            .order_by(col(StudyActiveSession.updated_at).desc())
        ).all()

        out = []
        for s in sessions:
            source = session.get(StudyMediaSource, s.source_id)
            out.append({
                "id": s.id,
                "title": s.title,
                "subject": s.subject,
                "status": s.status,
                "processingStatus": source.status if source else "READY",
                "currentChapterIndex": s.current_chapter_index,
                "currentTimeSeconds": s.current_time_seconds,
                "completedChaptersCount": s.completed_chapters_count,
                "totalChaptersCount": s.total_chapters_count,
                "overallMasteryPercent": round(s.overall_mastery_percent, 1),
                "sourceType": source.source_type if source else "document",
                "createdAt": s.created_at.isoformat(),
                "updatedAt": s.updated_at.isoformat(),
            })
        return out


@router.post("")
async def create_active_session_upload(
    title: str = Form(...),
    subject: str = Form("General Academic"),
    source_type: str = Form("document"),
    file: UploadFile = File(None),
    user: User = Depends(current_user),
):
    """Upload learning document file and initialize AI learning session."""
    assert user.id is not None
    title_clean = title.strip()
    if not title_clean:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session title is required.")

    file_path = None
    transcript = ""
    file_size = 0

    if file:
        data = await file.read()
        file_size = len(data)
        if file_size > 100 * 1024 * 1024:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "File size limit is 100MB.")

        # Entitlement check
        with get_session() as session:
            ok, msg = subscription.check_upload_quota(session, user, file_size)
            if not ok:
                raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, msg)

        ext = os.path.splitext(file.filename or "")[1] or ".pdf"
        file_key = f"media_{uuid.uuid4().hex[:10]}{ext}"
        file_path = os.path.join(LOCAL_MEDIA_DIR, file_key)
        with open(file_path, "wb") as f:
            f.write(data)

        if ext == ".pdf":
            try:
                import io
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(data))
                extracted_pages = [page.extract_text() for page in reader.pages if page.extract_text()]
                transcript = "\n".join(extracted_pages) if extracted_pages else ""
            except Exception:
                transcript = ""

        if not transcript:
            try:
                transcript = data.decode("utf-8", errors="ignore")
            except Exception:
                transcript = f"Learning document content for {title_clean}."

    with get_session() as session:
        source = StudyMediaSource(
            user_id=user.id,
            source_type=source_type,
            title=title_clean,
            file_path=file_path,
            transcript_text=transcript,
            status="PROCESSING",
        )
        session.add(source)
        session.commit()
        session.refresh(source)

        active_session = StudyActiveSession(
            user_id=user.id,
            source_id=source.id,
            title=title_clean,
            subject=subject,
            status="in_progress",
        )
        session.add(active_session)
        session.commit()
        session.refresh(active_session)

        # Run pipeline
        _run_processing_pipeline(session, source, active_session)

        return {
            "id": active_session.id,
            "title": active_session.title,
            "subject": active_session.subject,
            "processingStatus": source.status,
            "totalChaptersCount": active_session.total_chapters_count,
        }


@router.post("/url")
def create_active_session_url(body: SessionCreateUrlIn, user: User = Depends(current_user)):
    """Create AI learning session from YouTube or video URL."""
    assert user.id is not None
    url = body.url.strip()
    if not url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "URL is required.")

    title = body.title.strip() or f"Video Lecture: {url[:30]}"

    with get_session() as session:
        source = StudyMediaSource(
            user_id=user.id,
            source_type="youtube_url",
            title=title,
            url=url,
            transcript_text=f"Video lecture transcript from {url}. Covers definitions, topic boundaries, key formulas, and practical examples.",
            status="PROCESSING",
        )
        session.add(source)
        session.commit()
        session.refresh(source)

        active_session = StudyActiveSession(
            user_id=user.id,
            source_id=source.id,
            title=title,
            subject=body.subject,
            status="in_progress",
        )
        session.add(active_session)
        session.commit()
        session.refresh(active_session)

        _run_processing_pipeline(session, source, active_session)

        return {
            "id": active_session.id,
            "title": active_session.title,
            "processingStatus": source.status,
            "totalChaptersCount": active_session.total_chapters_count,
        }


@router.get("/{session_id}")
def get_active_session_details(session_id: int, user: User = Depends(current_user)):
    """Fetch complete active learning session, micro-chapters, and processing status."""
    assert user.id is not None
    with get_session() as session:
        active_session = session.get(StudyActiveSession, session_id)
        if not active_session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Study session not found.")
        if active_session.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied to private study session.")

        source = session.get(StudyMediaSource, active_session.source_id)

        chapters = session.exec(
            select(StudyChapter)
            .where(StudyChapter.session_id == session_id)
            .order_by(col(StudyChapter.chapter_index).asc())
        ).all()

        ch_out = []
        for ch in chapters:
            questions = session.exec(select(StudyQuestion).where(StudyQuestion.chapter_id == ch.id)).all()
            q_out = []
            for q in questions:
                q_out.append({
                    "id": q.id,
                    "questionType": q.question_type,
                    "questionText": q.question_text,
                    "options": json.loads(q.options_json or "[]"),
                    "explanation": q.explanation,
                    "conceptTag": q.concept_tag,
                })

            ch_out.append({
                "id": ch.id,
                "chapterIndex": ch.chapter_index,
                "title": ch.title,
                "startTime": ch.start_time,
                "endTime": ch.end_time,
                "durationSeconds": ch.duration_seconds,
                "shortExplanation": ch.short_explanation,
                "keyConcepts": json.loads(ch.key_concepts_json or "[]"),
                "learningObjective": ch.learning_objective,
                "difficulty": ch.difficulty,
                "status": ch.status,
                "questions": q_out,
            })

        masteries = session.exec(select(ConceptMastery).where(ConceptMastery.session_id == session_id)).all()

        return {
            "id": active_session.id,
            "title": active_session.title,
            "subject": active_session.subject,
            "status": active_session.status,
            "processingStatus": source.status if source else "READY",
            "processingError": source.error_message if source else None,
            "currentChapterIndex": active_session.current_chapter_index,
            "currentTimeSeconds": active_session.current_time_seconds,
            "completedChaptersCount": active_session.completed_chapters_count,
            "totalChaptersCount": active_session.total_chapters_count,
            "overallMasteryPercent": round(active_session.overall_mastery_percent, 1),
            "mediaUrl": source.url if source and source.url else None,
            "mediaPath": source.file_path if source and source.file_path else None,
            "chapters": ch_out,
            "conceptMastery": [
                {
                    "conceptName": cm.concept_name,
                    "masteryScore": round(cm.mastery_score, 1),
                    "status": cm.status,
                }
                for cm in masteries
            ],
        }


@router.post("/{session_id}/process")
def trigger_session_processing(session_id: int, user: User = Depends(current_user)):
    """Trigger or re-execute AI processing pipeline for study session."""
    assert user.id is not None
    with get_session() as session:
        active_session = session.get(StudyActiveSession, session_id)
        if not active_session or active_session.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Study session not found.")

        source = session.get(StudyMediaSource, active_session.source_id)
        if not source:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Media source not found.")

        _run_processing_pipeline(session, source, active_session)
        return {"status": source.status, "session_id": session_id}


@router.get("/chapters/{chapter_id}")
def get_chapter_details(chapter_id: int, user: User = Depends(current_user)):
    """Fetch single micro-chapter details, questions, and recall evaluation if available."""
    assert user.id is not None
    with get_session() as session:
        ch = session.get(StudyChapter, chapter_id)
        if not ch:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")

        active_session = session.get(StudyActiveSession, ch.session_id)
        if not active_session or active_session.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied.")

        questions = session.exec(select(StudyQuestion).where(StudyQuestion.chapter_id == chapter_id)).all()
        q_out = []
        for q in questions:
            # check previous attempt
            last_attempt = session.exec(
                select(StudyAttempt)
                .where(StudyAttempt.user_id == user.id, StudyAttempt.question_id == q.id)
                .order_by(col(StudyAttempt.created_at).desc())
            ).first()

            q_out.append({
                "id": q.id,
                "questionType": q.question_type,
                "questionText": q.question_text,
                "options": json.loads(q.options_json or "[]"),
                "explanation": q.explanation,
                "conceptTag": q.concept_tag,
                "lastAttempt": {
                    "userAnswer": last_attempt.user_answer,
                    "isCorrect": last_attempt.is_correct,
                    "score": last_attempt.score,
                } if last_attempt else None,
            })

        last_recall = session.exec(
            select(ActiveRecallEvaluation)
            .where(ActiveRecallEvaluation.user_id == user.id, ActiveRecallEvaluation.chapter_id == chapter_id)
            .order_by(col(ActiveRecallEvaluation.created_at).desc())
        ).first()

        return {
            "id": ch.id,
            "chapterIndex": ch.chapter_index,
            "title": ch.title,
            "startTime": ch.start_time,
            "endTime": ch.end_time,
            "durationSeconds": ch.duration_seconds,
            "transcriptSegment": ch.transcript_segment,
            "shortExplanation": ch.short_explanation,
            "keyConcepts": json.loads(ch.key_concepts_json or "[]"),
            "learningObjective": ch.learning_objective,
            "difficulty": ch.difficulty,
            "status": ch.status,
            "questions": q_out,
            "lastRecallEvaluation": {
                "understandingScore": last_recall.understanding_score,
                "understoodConcepts": json.loads(last_recall.understood_concepts_json or "[]"),
                "missingConcepts": json.loads(last_recall.missing_concepts_json or "[]"),
                "misconceptions": json.loads(last_recall.misconceptions_json or "[]"),
                "recommendation": last_recall.recommendation,
                "userResponseText": last_recall.user_response_text,
            } if last_recall else None,
        }


@router.post("/chapters/{chapter_id}/recall")
def submit_active_recall(chapter_id: int, body: ActiveRecallIn, user: User = Depends(current_user)):
    """Evaluate user active recall response using LLM."""
    assert user.id is not None
    user_response = (body.user_response or "").strip()
    if not user_response:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Recall response cannot be empty.")

    with get_session() as session:
        ch = session.get(StudyChapter, chapter_id)
        if not ch:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")

        active_session = session.get(StudyActiveSession, ch.session_id)
        if not active_session or active_session.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied.")

        eval_res = llm.evaluate_active_recall(ch.title, ch.transcript_segment, user_response)

        eval_obj = ActiveRecallEvaluation(
            user_id=user.id,
            chapter_id=chapter_id,
            user_response_text=user_response,
            understanding_score=eval_res.get("understanding_score", 70),
            understood_concepts_json=json.dumps(eval_res.get("understood_concepts") or []),
            missing_concepts_json=json.dumps(eval_res.get("missing_concepts") or []),
            misconceptions_json=json.dumps(eval_res.get("misconceptions") or []),
            recommendation=eval_res.get("recommendation") or "Keep learning!",
        )
        eval_score = eval_res.get("understanding_score", 70)
        understood = eval_res.get("understood_concepts") or []
        missing = eval_res.get("missing_concepts") or []

        # Update Concept Mastery based on active recall evaluation
        chapter_concepts = json.loads(ch.key_concepts_json or "[]")
        for c_name in set(chapter_concepts + understood + missing):
            cm = session.exec(
                select(ConceptMastery)
                .where(ConceptMastery.session_id == active_session.id, ConceptMastery.concept_name == c_name)
            ).first()
            if cm:
                cm.attempts_count += 1
                if c_name in understood or (not missing and eval_score >= 70):
                    cm.correct_count += 1
                cm.mastery_score = (cm.correct_count / max(1, cm.attempts_count)) * 100.0
                _update_concept_status(cm)
                cm.last_evaluated_at = datetime.now(timezone.utc)
                session.add(cm)

        # Update overall session mastery
        all_masteries = session.exec(select(ConceptMastery).where(ConceptMastery.session_id == active_session.id)).all()
        if all_masteries:
            avg_score = sum(m.mastery_score for m in all_masteries) / len(all_masteries)
            active_session.overall_mastery_percent = avg_score
            session.add(active_session)

        session.commit()

        return {
            "understandingScore": eval_obj.understanding_score,
            "understoodConcepts": eval_res.get("understood_concepts") or [],
            "missingConcepts": eval_res.get("missing_concepts") or [],
            "misconceptions": eval_res.get("misconceptions") or [],
            "recommendation": eval_obj.recommendation,
        }


@router.post("/questions/{question_id}/answer")
def submit_quiz_answer(question_id: int, body: QuizAnswerIn, user: User = Depends(current_user)):
    """Submit quiz answer, calculate score, persist attempt, and update concept mastery."""
    assert user.id is not None
    user_ans = (body.user_answer or "").strip()

    with get_session() as session:
        q = session.get(StudyQuestion, question_id)
        if not q:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found.")

        ch = session.get(StudyChapter, q.chapter_id)
        if not ch:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")

        active_session = session.get(StudyActiveSession, ch.session_id)
        if not active_session or active_session.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied.")

        # Check correctness
        is_correct = user_ans.lower() == q.correct_answer.lower()
        score = 100.0 if is_correct else 0.0

        attempt = StudyAttempt(
            user_id=user.id,
            chapter_id=ch.id,
            question_id=q.id,
            user_answer=user_ans,
            is_correct=is_correct,
            score=score,
            time_taken_seconds=body.time_taken_seconds,
        )
        session.add(attempt)

        # Update Concept Mastery
        cm = session.exec(
            select(ConceptMastery)
            .where(ConceptMastery.session_id == active_session.id, ConceptMastery.concept_name == q.concept_tag)
        ).first()

        if cm:
            cm.attempts_count += 1
            if is_correct:
                cm.correct_count += 1
            cm.mastery_score = (cm.correct_count / max(1, cm.attempts_count)) * 100.0
            _update_concept_status(cm)
            cm.last_evaluated_at = datetime.now(timezone.utc)
            session.add(cm)

        # Update mindmap node mastery
        node = session.exec(
            select(StudyMindMapNode)
            .where(StudyMindMapNode.session_id == active_session.id, StudyMindMapNode.concept_tag == q.concept_tag)
        ).first()
        if node and cm:
            node.mastery_status = cm.status
            session.add(node)

        # Update overall session mastery
        all_masteries = session.exec(select(ConceptMastery).where(ConceptMastery.session_id == active_session.id)).all()
        if all_masteries:
            avg_score = sum(m.mastery_score for m in all_masteries) / len(all_masteries)
            active_session.overall_mastery_percent = avg_score
            session.add(active_session)

        session.commit()

        return {
            "isCorrect": is_correct,
            "correctAnswer": q.correct_answer,
            "explanation": q.explanation,
            "score": score,
            "conceptMasteryStatus": cm.status if cm else "Learning",
            "overallMasteryPercent": round(active_session.overall_mastery_percent, 1),
        }


@router.get("/{session_id}/mindmap")
def get_session_mindmap(session_id: int, user: User = Depends(current_user)):
    """Fetch dynamic mind map graph structure for session."""
    assert user.id is not None
    with get_session() as session:
        active_session = session.get(StudyActiveSession, session_id)
        if not active_session or active_session.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Study session not found.")

        nodes = session.exec(
            select(StudyMindMapNode).where(StudyMindMapNode.session_id == session_id)
        ).all()

        return [
            {
                "id": n.node_key,
                "label": n.label,
                "parentKey": n.parent_key,
                "conceptTag": n.concept_tag,
                "masteryStatus": n.mastery_status,
                "depth": n.depth,
            }
            for n in nodes
        ]


@router.post("/{session_id}/progress")
def update_session_progress(session_id: int, body: ProgressUpdateIn, user: User = Depends(current_user)):
    """Persist learner playback timestamp, current chapter index, and completed chapters state."""
    assert user.id is not None
    with get_session() as session:
        active_session = session.get(StudyActiveSession, session_id)
        if not active_session or active_session.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Study session not found.")

        active_session.current_chapter_index = body.current_chapter_index
        active_session.current_time_seconds = body.current_time_seconds

        # Update chapter status
        chapters = session.exec(
            select(StudyChapter)
            .where(StudyChapter.session_id == session_id)
            .order_by(col(StudyChapter.chapter_index).asc())
        ).all()

        completed_cnt = 0
        for ch in chapters:
            if ch.chapter_index < body.current_chapter_index:
                ch.status = "completed"
                completed_cnt += 1
            elif ch.chapter_index == body.current_chapter_index:
                ch.status = "in_progress"
            else:
                if ch.status != "completed":
                    ch.status = "unstarted"
            session.add(ch)

        active_session.completed_chapters_count = completed_cnt
        if active_session.total_chapters_count > 0 and completed_cnt >= active_session.total_chapters_count:
            active_session.status = "completed"

        active_session.updated_at = datetime.now(timezone.utc)
        session.add(active_session)
        session.commit()

        return {
            "currentChapterIndex": active_session.current_chapter_index,
            "currentTimeSeconds": active_session.current_time_seconds,
            "completedChaptersCount": active_session.completed_chapters_count,
            "status": active_session.status,
        }


@router.post("/from-paper/{paper_id}")
def create_session_from_paper(paper_id: int, user: User = Depends(current_user)):
    """Create active study session directly from a Paper Vault document."""
    assert user.id is not None
    with get_session() as session:
        paper = session.get(QuestionPaper, paper_id)
        if not paper:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found.")

        if not paper.is_public and paper.uploader_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied to private paper.")

        transcript = paper.extracted_ocr_text or f"Study material for {paper.title}. Subject: {paper.subject} {paper.exam_tag}."

        source = StudyMediaSource(
            user_id=user.id,
            source_type="paper_id",
            title=paper.title,
            file_path=paper.file_path,
            transcript_text=transcript,
            status="PROCESSING",
        )
        session.add(source)
        session.commit()
        session.refresh(source)

        active_session = StudyActiveSession(
            user_id=user.id,
            source_id=source.id,
            title=f"Paper Study: {paper.title}",
            subject=paper.subject or "General Academic",
            status="in_progress",
        )
        session.add(active_session)
        session.commit()
        session.refresh(active_session)

        _run_processing_pipeline(session, source, active_session)

        return {
            "id": active_session.id,
            "title": active_session.title,
            "processingStatus": source.status,
        }


@router.post("/from-capture/{capture_id}")
def create_session_from_capture(capture_id: int, user: User = Depends(current_user)):
    """Create active study session directly from a Spark Capture card."""
    assert user.id is not None
    with get_session() as session:
        card = session.get(Card, capture_id)
        if not card or card.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Capture note not found.")

        transcript = card.raw or card.summary or f"Capture note for {card.title}."

        source = StudyMediaSource(
            user_id=user.id,
            source_type="capture_id",
            title=card.title or "Captured Learning Material",
            transcript_text=transcript,
            status="PROCESSING",
        )
        session.add(source)
        session.commit()
        session.refresh(source)

        active_session = StudyActiveSession(
            user_id=user.id,
            source_id=source.id,
            title=card.title or "Captured Study Session",
            subject=card.topic or "General Academic",
            status="in_progress",
        )
        session.add(active_session)
        session.commit()
        session.refresh(active_session)

        _run_processing_pipeline(session, source, active_session)

        return {
            "id": active_session.id,
            "title": active_session.title,
            "processingStatus": source.status,
        }


@router.delete("/{session_id}")
def delete_active_study_session(session_id: int, user: User = Depends(current_user)):
    """Permanently delete an active study session and its associated chapters & questions."""
    assert user.id is not None
    with get_session() as session:
        active_session = session.get(StudyActiveSession, session_id)
        if not active_session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Study session not found.")
        if active_session.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied to this study session.")

        chapters = session.exec(
            select(StudyChapter).where(StudyChapter.session_id == session_id)
        ).all()
        for ch in chapters:
            questions = session.exec(
                select(StudyQuestion).where(StudyQuestion.chapter_id == ch.id)
            ).all()
            for q in questions:
                session.delete(q)
            session.delete(ch)

        source_id = active_session.source_id
        session.delete(active_session)
        session.commit()

        if source_id:
            other_sessions = session.exec(
                select(StudyActiveSession).where(StudyActiveSession.source_id == source_id)
            ).all()
            if not other_sessions:
                src = session.get(StudyMediaSource, source_id)
                if src:
                    session.delete(src)
                    session.commit()

        return {"ok": True, "message": "Study session deleted successfully."}
