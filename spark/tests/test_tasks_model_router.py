"""Tests for T2 Resilient AI Model Router & Multi-Provider Fallback Layer.
Covers scenarios A through O:
  A. OpenRouter success
  B. OpenRouter 5xx -> Groq success
  C. OpenRouter timeout -> Groq success
  D. OpenRouter unavailable -> Gemini success
  E. Provider authentication/configuration failure (401 non-retryable skip)
  F. All providers unavailable -> AIServiceUnavailableError
  G. Malformed provider response -> fallback
  H. Structured JSON success (TaskSolutionSchema)
  I. Malformed JSON rejection/fallback (missing fields)
  J. Global timeout/deadline truncation
  K. Missing provider credentials (safely skipped)
  L. No API secrets exposed in logs or error messages
  M. Backward compatibility of all public llm.py functions
  N. Tasks regression compatibility
  O. Study/ingest regression compatibility
"""
import json
import os
import sys
import time
from unittest.mock import MagicMock, patch
import httpx
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from spark import llm
from spark.llm import (
    AIServiceUnavailableError,
    LLMAuthError,
    LLMInvalidOutputError,
    LLMProviderError,
    LLMRateLimitError,
    LLMTimeoutError,
    ModelRouter,
    OpenRouterAdapter,
    GroqAdapter,
    GeminiAdapter,
    TaskSolutionSchema,
    StudyChaptersSchema,
    ActiveRecallSchema,
    _extract_and_validate_json,
    _sanitize_log,
)
from spark.config import get_settings


VALID_SOLUTION_JSON = {
    "subject": "Mathematics",
    "icon": "🧮",
    "title": "Solve 2x + 6 = 14",
    "solution": "The solution is x = 4.",
    "steps": [
        "1. Subtract 6 from both sides: 2x = 8.",
        "2. Divide both sides by 2: x = 4.",
    ],
    "formulas": ["Linear equation form: ax + b = c"],
    "intuition": "Isolate the variable term by balancing inverse operations.",
    "practice": [
        "Problem: Solve 3x + 9 = 21 | Answer: x = 4",
        "Problem: Solve 5x - 10 = 15 | Answer: x = 5",
    ],
}


@pytest.fixture(autouse=True)
def reset_settings():
    """Reset shared settings before and after each test to prevent side-effects."""
    settings = get_settings()
    settings.openrouter_api_key = ""
    settings.groq_api_key = ""
    settings.gemini_api_key = ""
    settings.xai_api_key = ""
    settings.anthropic_api_key = ""
    settings.llm_provider = "mock"
    yield
    settings.openrouter_api_key = ""
    settings.groq_api_key = ""
    settings.gemini_api_key = ""
    settings.xai_api_key = ""
    settings.anthropic_api_key = ""
    settings.llm_provider = "mock"


def _make_openrouter_response(content_dict_or_str, status_code=200):
    content = json.dumps(content_dict_or_str) if isinstance(content_dict_or_str, dict) else str(content_dict_or_str)
    return httpx.Response(
        status_code=status_code,
        json={"choices": [{"message": {"role": "assistant", "content": content}}]},
        request=httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions"),
    )


def _make_groq_response(content_dict_or_str, status_code=200):
    content = json.dumps(content_dict_or_str) if isinstance(content_dict_or_str, dict) else str(content_dict_or_str)
    return httpx.Response(
        status_code=status_code,
        json={"choices": [{"message": {"role": "assistant", "content": content}}]},
        request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
    )


def _make_gemini_response(content_dict_or_str, status_code=200):
    content = json.dumps(content_dict_or_str) if isinstance(content_dict_or_str, dict) else str(content_dict_or_str)
    return httpx.Response(
        status_code=status_code,
        json={"candidates": [{"content": {"parts": [{"text": content}]}}]},
        request=httpx.Request("POST", "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"),
    )


# --- Scenario A: OpenRouter Success ------------------------------------------

def test_scenario_a_openrouter_success():
    """OpenRouter responds 200 with valid TaskSolution; router returns structured dict."""
    settings = get_settings()
    settings.openrouter_api_key = "sk-test-openrouter-key"
    settings.llm_provider = "openrouter"

    def mock_post(url, *args, **kwargs):
        if "openrouter.ai" in str(url):
            return _make_openrouter_response(VALID_SOLUTION_JSON, status_code=200)
        raise RuntimeError("Unexpected URL")

    with patch("httpx.Client.post", side_effect=mock_post):
        router = ModelRouter()
        res = router.generate_structured("Solve 2x + 6 = 14", schema=TaskSolutionSchema)
        assert res["title"] == "Solve 2x + 6 = 14"
        assert res["solution"] == "The solution is x = 4."
        assert len(res["steps"]) == 2


# --- Scenario B: OpenRouter 5xx -> Groq Success -------------------------------

def test_scenario_b_openrouter_5xx_groq_success():
    """OpenRouter returns 500, router automatically falls back to Groq which succeeds."""
    settings = get_settings()
    settings.openrouter_api_key = "sk-test-openrouter-key"
    settings.groq_api_key = "gsk_test-groq-key"
    settings.llm_provider = "openrouter"

    def mock_post(url, *args, **kwargs):
        url_str = str(url)
        if "openrouter.ai" in url_str:
            return httpx.Response(status_code=500, json={"error": "Internal Server Error"}, request=httpx.Request("POST", url_str))
        if "api.groq.com" in url_str:
            return _make_groq_response(VALID_SOLUTION_JSON, status_code=200)
        raise RuntimeError(f"Unexpected URL: {url_str}")

    with patch("httpx.Client.post", side_effect=mock_post):
        router = ModelRouter()
        res = router.generate_structured("Solve 2x + 6 = 14", schema=TaskSolutionSchema)
        assert res["solution"] == "The solution is x = 4."


# --- Scenario C: OpenRouter Timeout -> Groq Success ---------------------------

def test_scenario_c_openrouter_timeout_groq_success():
    """OpenRouter times out; router catches timeout and falls back to Groq with remaining deadline."""
    settings = get_settings()
    settings.openrouter_api_key = "sk-test-openrouter-key"
    settings.groq_api_key = "gsk_test-groq-key"
    settings.llm_provider = "openrouter"

    def mock_post(url, *args, **kwargs):
        url_str = str(url)
        if "openrouter.ai" in url_str:
            raise httpx.ReadTimeout("Request timed out", request=httpx.Request("POST", url_str))
        if "api.groq.com" in url_str:
            return _make_groq_response(VALID_SOLUTION_JSON, status_code=200)
        raise RuntimeError(f"Unexpected URL: {url_str}")

    with patch("httpx.Client.post", side_effect=mock_post):
        router = ModelRouter()
        res = router.generate_structured("Solve 2x + 6 = 14", schema=TaskSolutionSchema)
        assert res["solution"] == "The solution is x = 4."


# --- Scenario D: OpenRouter Unavailable -> Gemini Success ---------------------

def test_scenario_d_openrouter_and_groq_fail_gemini_success():
    """OpenRouter 503 and Groq 500 fail; router falls back to Gemini which succeeds."""
    settings = get_settings()
    settings.openrouter_api_key = "sk-test-openrouter-key"
    settings.groq_api_key = "gsk_test-groq-key"
    settings.gemini_api_key = "AIzaSyTestKey"
    settings.llm_provider = "openrouter"

    def mock_post(url, *args, **kwargs):
        url_str = str(url)
        if "openrouter.ai" in url_str:
            return httpx.Response(status_code=503, json={"error": "Service Unavailable"}, request=httpx.Request("POST", url_str))
        if "api.groq.com" in url_str:
            return httpx.Response(status_code=500, json={"error": "Groq Server Error"}, request=httpx.Request("POST", url_str))
        if "generativelanguage.googleapis.com" in url_str:
            return _make_gemini_response(VALID_SOLUTION_JSON, status_code=200)
        raise RuntimeError(f"Unexpected URL: {url_str}")

    with patch("httpx.Client.post", side_effect=mock_post):
        router = ModelRouter()
        res = router.generate_structured("Solve 2x + 6 = 14", schema=TaskSolutionSchema)
        assert res["solution"] == "The solution is x = 4."


# --- Scenario E: Provider Auth Failure (Non-retryable skip) -------------------

def test_scenario_e_provider_auth_failure_skips_immediately():
    """HTTP 401/403 triggers non-retryable provider skip and advances to next provider."""
    settings = get_settings()
    settings.openrouter_api_key = "invalid-openrouter-key"
    settings.groq_api_key = "valid-groq-key"
    settings.llm_provider = "openrouter"

    attempts = []

    def mock_post(url, *args, **kwargs):
        url_str = str(url)
        if "openrouter.ai" in url_str:
            attempts.append("openrouter")
            return httpx.Response(status_code=401, json={"error": "Unauthorized"}, request=httpx.Request("POST", url_str))
        if "api.groq.com" in url_str:
            attempts.append("groq")
            return _make_groq_response(VALID_SOLUTION_JSON, status_code=200)
        raise RuntimeError(f"Unexpected URL: {url_str}")

    with patch("httpx.Client.post", side_effect=mock_post):
        router = ModelRouter()
        res = router.generate_structured("Solve 2x + 6 = 14", schema=TaskSolutionSchema)
        assert res["solution"] == "The solution is x = 4."
        assert attempts == ["openrouter", "groq"]  # OpenRouter attempted once, not retried


# --- Scenario F: All Providers Unavailable ------------------------------------

def test_scenario_f_all_providers_unavailable_raises_controlled_error():
    """When all configured providers fail, router raises AIServiceUnavailableError."""
    settings = get_settings()
    settings.openrouter_api_key = "sk-key"
    settings.groq_api_key = "gsk_key"
    settings.gemini_api_key = ""  # Not configured
    settings.llm_provider = "openrouter"

    def mock_post(url, *args, **kwargs):
        url_str = str(url)
        return httpx.Response(status_code=500, json={"error": "Fatal Error"}, request=httpx.Request("POST", url_str))

    with patch("httpx.Client.post", side_effect=mock_post):
        router = ModelRouter()
        with pytest.raises(AIServiceUnavailableError) as exc_info:
            router.generate_structured("Solve 2x + 6 = 14", schema=TaskSolutionSchema)
        assert "temporarily unavailable" in str(exc_info.value).lower()
        # Verify it is an instance of RuntimeError for backwards compatibility
        assert isinstance(exc_info.value, RuntimeError)


# --- Scenario G: Malformed Provider Response -> Fallback ----------------------

def test_scenario_g_malformed_response_triggers_fallback():
    """OpenRouter returns non-JSON text; router catches invalid output and falls back to Groq."""
    settings = get_settings()
    settings.openrouter_api_key = "sk-key"
    settings.groq_api_key = "gsk_key"
    settings.llm_provider = "openrouter"

    def mock_post(url, *args, **kwargs):
        url_str = str(url)
        if "openrouter.ai" in url_str:
            return _make_openrouter_response("I am sorry, I cannot output JSON right now.", status_code=200)
        if "api.groq.com" in url_str:
            return _make_groq_response(VALID_SOLUTION_JSON, status_code=200)
        raise RuntimeError(f"Unexpected URL: {url_str}")

    with patch("httpx.Client.post", side_effect=mock_post):
        router = ModelRouter()
        res = router.generate_structured("Solve 2x + 6 = 14", schema=TaskSolutionSchema)
        assert res["solution"] == "The solution is x = 4."


# --- Scenario H: Structured JSON Schema Success -------------------------------

def test_scenario_h_structured_json_success():
    """Valid JSON matching schema parses cleanly and tolerates markdown code fences."""
    fenced_raw = f"```json\n{json.dumps(VALID_SOLUTION_JSON)}\n```"
    result = _extract_and_validate_json(fenced_raw, schema=TaskSolutionSchema)
    assert result["title"] == "Solve 2x + 6 = 14"
    assert result["subject"] == "Mathematics"
    assert isinstance(result["steps"], list)
    assert len(result["steps"]) == 2


# --- Scenario I: Malformed JSON Rejection & Fallback --------------------------

def test_scenario_i_missing_required_schema_fields_triggers_fallback():
    """OpenRouter returns JSON missing required 'solution' field; router rejects it and falls back to Groq."""
    settings = get_settings()
    settings.openrouter_api_key = "sk-key"
    settings.groq_api_key = "gsk_key"
    settings.llm_provider = "openrouter"

    invalid_fields_json = {
        "subject": "Mathematics",
        "title": "Solve 2x + 6 = 14",
        # Missing "solution" and "steps"
    }

    def mock_post(url, *args, **kwargs):
        url_str = str(url)
        if "openrouter.ai" in url_str:
            return _make_openrouter_response(invalid_fields_json, status_code=200)
        if "api.groq.com" in url_str:
            return _make_groq_response(VALID_SOLUTION_JSON, status_code=200)
        raise RuntimeError(f"Unexpected URL: {url_str}")

    with patch("httpx.Client.post", side_effect=mock_post):
        router = ModelRouter()
        res = router.generate_structured("Solve 2x + 6 = 14", schema=TaskSolutionSchema)
        assert res["solution"] == "The solution is x = 4."


# --- Scenario J: Global Timeout / Deadline Truncation -------------------------

def test_scenario_j_global_deadline_stops_further_attempts():
    """When deadline has expired or remaining time is less than minimum, further attempts are aborted."""
    settings = get_settings()
    settings.openrouter_api_key = "sk-key"
    settings.groq_api_key = "gsk_key"
    settings.llm_provider = "openrouter"

    attempts = []

    def mock_post(url, *args, **kwargs):
        url_str = str(url)
        attempts.append(url_str)
        time.sleep(0.05)
        return httpx.Response(status_code=500, json={"error": "error"}, request=httpx.Request("POST", url_str))

    with patch("httpx.Client.post", side_effect=mock_post):
        router = ModelRouter()
        # With deadline of 0.01 seconds, openrouter failure exceeds deadline, groq is never attempted
        with pytest.raises(AIServiceUnavailableError):
            router.generate_structured("Solve", schema=TaskSolutionSchema, deadline=0.01)
        assert len(attempts) <= 1


# --- Scenario K: Missing Provider Credentials ---------------------------------

def test_scenario_k_missing_provider_credentials_skipped():
    """Providers without configured keys are skipped cleanly from candidate list."""
    settings = get_settings()
    settings.openrouter_api_key = ""
    settings.groq_api_key = ""
    settings.gemini_api_key = ""
    settings.xai_api_key = ""
    settings.anthropic_api_key = ""

    router = ModelRouter()
    candidates = router.get_candidate_providers()
    assert len(candidates) == 0

    with pytest.raises(AIServiceUnavailableError) as exc_info:
        router.generate_text("Hello")
    assert "no ai providers" in str(exc_info.value).lower()


# --- Scenario L: No Secrets Exposed in Logs or Errors -------------------------

def test_scenario_l_no_secrets_exposed_in_logs_or_errors():
    """Verify that _sanitize_log redacts sk-*, gsk_*, AIza*, and Bearer tokens."""
    dirty_msg = "Error using key sk-abcdef1234567890 and header Bearer eyJhbGciOiJIUzI1NiIsInR5 and gsk_9876543210123"
    clean_msg = _sanitize_log(dirty_msg)
    assert "sk-abcdef1234567890" not in clean_msg
    assert "gsk_9876543210123" not in clean_msg
    assert "Bearer eyJhbGciOiJIUzI1NiIsInR5" not in clean_msg
    assert "[REDACTED]" in clean_msg


# --- Scenario M: Backward Compatibility of All Public llm.py Functions --------

def test_scenario_m_backward_compatibility_public_functions():
    """All existing public function signatures exist, accept expected args, and return expected shapes."""
    # 1. enrich
    r_enrich = llm.enrich("Note about startups and fundraising")
    assert isinstance(r_enrich, dict)
    assert "summary" in r_enrich
    assert "tags" in r_enrich

    # 2. enrich_full
    r_enrich_full = llm.enrich_full("Python programming algorithms")
    assert isinstance(r_enrich_full, dict)
    assert "title" in r_enrich_full
    assert "summary" in r_enrich_full
    assert "tags" in r_enrich_full
    assert "topic" in r_enrich_full

    # 3. synthesize
    r_synth = llm.synthesize("What is photosynthesis?", ["Photosynthesis converts light to sugar in plants.", "Chloroplasts contain chlorophyll."])
    assert isinstance(r_synth, str)
    assert len(r_synth) > 0

    # 4. draft
    r_draft = llm.draft("Write a brief summary", ["Card 1 content", "Card 2 content"])
    assert isinstance(r_draft, str)

    # 5. learning_plan
    r_plan = llm.learning_plan([{"skill": "React", "demand": 0.85}])
    assert isinstance(r_plan, list)
    assert len(r_plan) == 1
    assert r_plan[0]["skill"] == "React"

    # 6. solve_student_task (in mock mode)
    r_task = llm.solve_student_task("Solve x + 5 = 10", subject_hint="Mathematics")
    assert isinstance(r_task, dict)
    assert "solution" in r_task
    assert "steps" in r_task

    # 7. solve_task_followup
    r_followup = llm.solve_task_followup("Solve x + 5 = 10", "x = 5", [], "Why do you subtract 5?")
    assert isinstance(r_followup, str)

    # 8. generate_concept_chapters
    r_chap = llm.generate_concept_chapters("Photosynthesis in plants involves light reactions and dark reactions in chloroplasts.", title="Biology Chapter")
    assert isinstance(r_chap, dict)
    assert "chapters" in r_chap
    assert len(r_chap["chapters"]) > 0

    # 9. evaluate_active_recall
    r_eval = llm.evaluate_active_recall("Chapter 1", "Light reactions occur in thylakoid membranes.", "The light reactions happen in thylakoids and produce ATP.")
    assert isinstance(r_eval, dict)
    assert "understanding_score" in r_eval
    assert 0 <= r_eval["understanding_score"] <= 100


# --- Scenario N: Production solve_student_task Re-raises AIServiceUnavailableError

def test_scenario_n_solve_student_task_raises_on_total_provider_failure():
    """In production (keys configured), if all providers fail, solve_student_task raises AIServiceUnavailableError."""
    settings = get_settings()
    settings.openrouter_api_key = "sk-prod-key"
    settings.llm_provider = "openrouter"

    def mock_post(url, *args, **kwargs):
        return httpx.Response(status_code=500, json={"error": "All providers down"}, request=httpx.Request("POST", str(url)))

    with patch("httpx.Client.post", side_effect=mock_post):
        with pytest.raises(AIServiceUnavailableError) as exc_info:
            llm.solve_student_task("Calculate integral of x^2 dx", subject_hint="Mathematics")
        assert "temporarily unavailable" in str(exc_info.value).lower()
        assert isinstance(exc_info.value, RuntimeError)


# --- Scenario O: Study/Ingest Regression Compatibility ------------------------

def test_scenario_o_study_and_ingest_compatibility():
    """Ensure study and ingest pipelines calling enrich_full and generate_concept_chapters run cleanly."""
    from spark.ingest import build_card_fields
    card = build_card_fields("text", "Quick note on machine learning and gradient descent algorithms")
    assert card["kind"] == "text"
    assert card["title"]
    assert card["summary"]
    assert len(card["tags"]) > 0
    assert card["difficulty"] >= 1
    assert card["importance"] >= 1
