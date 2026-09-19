"""Regression tests for Tasks input, validation, duplicate-submit, and error handling."""

import os
import sys
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from spark.main import app
from spark.models import User, StudentTask, get_session, init_db
from spark.auth import make_token

client = TestClient(app)


@pytest.fixture
def auth_header():
    init_db()
    with get_session() as session:
        user = session.exec(select(User).where(User.email == "tasks_hardening_student@example.com")).first()
        if not user:
            user = User(
                channel="web",
                external_id="tasks_hardening_student@example.com",
                email="tasks_hardening_student@example.com",
                name="Tasks Hardening Student",
            )
            session.add(user)
            session.commit()
            session.refresh(user)
        token = make_token(user)
    return {"Authorization": f"Bearer {token}"}


def test_empty_prompt_rejection(auth_header):
    """Empty string prompt must be rejected with HTTP 400."""
    res = client.post("/api/tasks/solve", headers=auth_header, json={"prompt": "", "subject_hint": ""})
    assert res.status_code == 400
    assert "Prompt is required" in res.text


def test_whitespace_only_prompt_rejection(auth_header):
    """Whitespace/newlines-only prompt must be rejected with HTTP 400."""
    res = client.post("/api/tasks/solve", headers=auth_header, json={"prompt": "   \n\t  \r\n   ", "subject_hint": ""})
    assert res.status_code == 400
    assert "Prompt is required" in res.text


def test_valid_typed_prompt_submission(auth_header):
    """Valid typed input executes solver and creates task record."""
    prompt = "Solve the equation 2x + 10 = 20"
    res = client.post("/api/tasks/solve", headers=auth_header, json={"prompt": prompt, "subject_hint": "Mathematics"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["solution"]
    assert "id" in body
    assert body["status"] == "Solved by AI"


def test_llm_failure_error_handling(auth_header):
    """Internal LLM solver error should return clean HTTP 500 without crashing server."""
    with patch("spark.llm.solve_student_task", side_effect=RuntimeError("AI provider unavailable")):
        res = client.post("/api/tasks/solve", headers=auth_header, json={"prompt": "Solve x^2 = 4", "subject_hint": ""})
        assert res.status_code == 500
        assert "AI provider unavailable" in res.text


def test_llm_rate_limit_429_handling(auth_header):
    """Rate limit from upstream AI provider returns clean error."""
    with patch("spark.llm.solve_student_task", side_effect=RuntimeError("OpenRouter API rate limit exceeded.")):
        res = client.post("/api/tasks/solve", headers=auth_header, json={"prompt": "Solve 3x = 9", "subject_hint": ""})
        assert res.status_code == 500
        assert "rate limit exceeded" in res.text.lower()


def test_task_followup_preserves_thread(auth_header):
    """Posting a follow-up appends user and AI turns to the thread."""
    res_solve = client.post("/api/tasks/solve", headers=auth_header, json={"prompt": "What is Newton's second law?", "subject_hint": "Physics"})
    assert res_solve.status_code == 200
    task_id = res_solve.json()["id"]

    res_followup = client.post(f"/api/tasks/{task_id}/followup", headers=auth_header, json={"followup_text": "What is an example calculation?"})
    assert res_followup.status_code == 200
    updated_task = res_followup.json()
    assert len(updated_task["thread"]) >= 2
    assert updated_task["thread"][0]["role"] == "user"
    assert updated_task["thread"][0]["content"] == "What is an example calculation?"
    assert updated_task["thread"][1]["role"] == "assistant"


def test_task_regenerate(auth_header):
    """Regenerate re-runs the AI solver on the task's prompt."""
    res_solve = client.post("/api/tasks/solve", headers=auth_header, json={"prompt": "What is 15 * 12?", "subject_hint": "Mathematics"})
    assert res_solve.status_code == 200
    task_id = res_solve.json()["id"]

    res_regen = client.post(f"/api/tasks/{task_id}/regenerate", headers=auth_header)
    assert res_regen.status_code == 200
    data = res_regen.json()
    assert data["solution"]
