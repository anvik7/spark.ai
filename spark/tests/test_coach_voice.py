"""Comprehensive automated test suite for Coach Emotional Voice Foundation & TTS Provider Abstraction.

Tests:
1. TTS Provider Factory resolves 'current' to CurrentTTSProvider.
2. Safe fallback: Unset, invalid, or unknown provider name defaults to CurrentTTSProvider.
3. Forward-compatibility placeholders: ChatterboxProvider and KokoroProvider fall back safely.
4. CurrentTTSProvider synthesizes audio via waterfall (MiniMax -> OpenAI -> gTTS).
5. Emotional prompting schema in next_interview_turn produces valid emotion and delivery metadata.
6. Backward-compatibility: Legacy LLM responses missing emotion/delivery are normalized gracefully.
7. Allowed emotion validation: Only professional tones allowed, no abusive/hostile emotions.
8. Start interview session endpoint initializes opening turn with warm emotion and delivery.
9. Answer interview turn persists emotion and delivery metadata into session history.
10. /api/tts endpoint receives emotion and delivery parameters and delegates to active provider.
"""
import sys
import os
import json
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

# Ensure src package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Use a dedicated SQLite database file for coach voice test suite
test_db_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_coach_voice_tmp.db"))
if os.path.exists(test_db_file):
    try:
        os.remove(test_db_file)
    except Exception:
        pass

os.environ["DATABASE_URL"] = f"sqlite:///{test_db_file}"
os.environ["SPARK_TTS_PROVIDER"] = "current"

from spark.config import get_settings
get_settings.cache_clear()

from spark.models import User, InterviewSession, get_session, init_db
from spark.auth import hash_password, make_token
from spark.tts import (
    BaseTTSProvider,
    TTSResult,
    CurrentTTSProvider,
    ChatterboxProvider,
    KokoroProvider,
    get_tts_provider,
)
from spark.interview import ALLOWED_EMOTIONS, next_interview_turn, generate_opening_question
from spark.main import app


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """Initialize clean database schema for the test session."""
    init_db()
    yield
    # Cleanup temporary SQLite database file
    if os.path.exists(test_db_file):
        try:
            os.remove(test_db_file)
        except Exception:
            pass


@pytest.fixture
def auth_user():
    """Create a verified candidate user and return user object and auth headers."""
    suffix = os.urandom(4).hex()
    email = f"candidate_voice_{suffix}@sparkdhi.ai"
    with get_session() as session:
        u = User(
            external_id=f"ext_cand_{suffix}",
            email=email,
            name="Candidate Voice",
            hashed_password=hash_password("StrongCandidate123!"),
            is_active=True,
            is_verified=True,
        )
        session.add(u)
        session.commit()
        session.refresh(u)
        uid = u.id

    token = make_token(u)
    headers = {"Authorization": f"Bearer {token}"}
    return {"id": uid, "email": email, "headers": headers}


# ==============================================================================
# SECTION 1: TTS Provider Factory & Placeholders
# ==============================================================================

def test_tts_provider_factory_default():
    """get_tts_provider with 'current' or default returns CurrentTTSProvider."""
    get_tts_provider.cache_clear()
    provider = get_tts_provider("current")
    assert isinstance(provider, CurrentTTSProvider)
    assert isinstance(provider, BaseTTSProvider)


def test_tts_provider_factory_fallback_unknown():
    """Unknown or invalid provider names safely fall back to CurrentTTSProvider."""
    get_tts_provider.cache_clear()
    provider = get_tts_provider("unknown_engine_xyz")
    assert isinstance(provider, CurrentTTSProvider)

    provider_empty = get_tts_provider("")
    assert isinstance(provider_empty, CurrentTTSProvider)


def test_tts_placeholder_chatterbox():
    """ChatterboxProvider safely delegates to fallback without crashing."""
    get_tts_provider.cache_clear()
    provider = get_tts_provider("chatterbox")
    assert isinstance(provider, ChatterboxProvider)

    with patch.object(provider._fallback, "synthesize") as mock_synth:
        mock_synth.return_value = TTSResult(
            audio_bytes=b"dummy_mp3_data",
            media_type="audio/mpeg",
            available=True,
            provider_name="current",
        )
        res = provider.synthesize("Hello candidate", emotion="warm")
        assert res.available is True
        assert res.provider_name == "chatterbox_fallback"
        assert res.audio_bytes == b"dummy_mp3_data"
        mock_synth.assert_called_once()


def test_tts_placeholder_kokoro():
    """KokoroProvider safely delegates to fallback without crashing."""
    get_tts_provider.cache_clear()
    provider = get_tts_provider("kokoro")
    assert isinstance(provider, KokoroProvider)

    with patch.object(provider._fallback, "synthesize") as mock_synth:
        mock_synth.return_value = TTSResult(
            audio_bytes=b"dummy_kokoro_data",
            media_type="audio/mpeg",
            available=True,
            provider_name="current",
        )
        res = provider.synthesize("Let us begin", emotion="curious")
        assert res.available is True
        assert res.provider_name == "kokoro_fallback"
        assert res.audio_bytes == b"dummy_kokoro_data"
        mock_synth.assert_called_once()


# ==============================================================================
# SECTION 2: CurrentTTSProvider Waterfall Synthesis
# ==============================================================================

def test_current_tts_empty_text():
    """Synthesizing empty text returns safe failure response."""
    provider = CurrentTTSProvider()
    res = provider.synthesize("   ")
    assert res.available is False
    assert "empty" in res.reason.lower()


def test_current_tts_minimax_success():
    """When MiniMax API key is configured and returns hex audio, it takes top priority."""
    provider = CurrentTTSProvider()
    fake_hex = b"fake_mp3_stream".hex()

    with patch("spark.tts.current.get_settings") as mock_settings, \
         patch("httpx.post") as mock_post:
        settings_inst = MagicMock()
        settings_inst.minimax_api_key = "mm_secret_key"
        settings_inst.minimax_tts_model = "speech-2.8-turbo"
        mock_settings.return_value = settings_inst

        resp_mock = MagicMock()
        resp_mock.status_code = 200
        resp_mock.json.return_value = {"data": {"audio": {"audio_file": fake_hex}}}
        mock_post.return_value = resp_mock

        res = provider.synthesize("Welcome to the interview.", emotion="warm")
        assert res.available is True
        assert res.audio_bytes == b"fake_mp3_stream"
        assert res.metadata.get("engine") == "minimax"
        assert res.metadata.get("emotion") == "warm"


def test_current_tts_openai_fallback():
    """When MiniMax is absent or fails, falls back to OpenAI TTS."""
    provider = CurrentTTSProvider()

    with patch("spark.tts.current.get_settings") as mock_settings, \
         patch("httpx.post") as mock_post:
        settings_inst = MagicMock()
        settings_inst.minimax_api_key = ""
        settings_inst.openai_api_key = "sk_openai_test"
        mock_settings.return_value = settings_inst

        resp_mock = MagicMock()
        resp_mock.status_code = 200
        resp_mock.content = b"openai_audio_bytes"
        mock_post.return_value = resp_mock

        res = provider.synthesize("Tell me about your background.", emotion="curious")
        assert res.available is True
        assert res.audio_bytes == b"openai_audio_bytes"
        assert res.metadata.get("engine") == "openai"


def test_current_tts_gtts_fallback():
    """When neither MiniMax nor OpenAI keys are configured, falls back to gTTS."""
    provider = CurrentTTSProvider()

    with patch("spark.tts.current.get_settings") as mock_settings, \
         patch("importlib.import_module") as mock_import:
        settings_inst = MagicMock()
        settings_inst.minimax_api_key = ""
        settings_inst.openai_api_key = ""
        mock_settings.return_value = settings_inst

        mock_gtts_mod = MagicMock()
        mock_gtts_class = MagicMock()
        mock_gtts_obj = MagicMock()

        def write_fake(buf):
            buf.write(b"gtts_generated_mp3")

        mock_gtts_obj.write_to_fp.side_effect = write_fake
        mock_gtts_class.return_value = mock_gtts_obj
        mock_gtts_mod.gTTS = mock_gtts_class
        mock_import.return_value = mock_gtts_mod

        res = provider.synthesize("Fallback test.", emotion="firm")
        assert res.available is True
        assert res.audio_bytes == b"gtts_generated_mp3"
        assert res.metadata.get("engine") == "gtts"


# ==============================================================================
# SECTION 3: Emotion Schema & Interview Reasoning
# ==============================================================================

def test_allowed_emotions_safety():
    """Allowed emotions must contain realistic professional interview tones and strictly exclude hostility."""
    expected_allowed = {
        "warm", "neutral", "curious", "encouraging", "impressed",
        "skeptical", "firm", "challenging", "concerned", "excited",
        "surprised", "closing"
    }
    assert ALLOWED_EMOTIONS == expected_allowed
    # Ensure abusive/hostile states are strictly forbidden
    forbidden = {"angry", "furious", "hostile", "abusive", "mocking", "insulting", "disgusted"}
    for f in forbidden:
        assert f not in ALLOWED_EMOTIONS


def test_next_interview_turn_llm_parsing():
    """next_interview_turn parses LLM response with emotion and delivery metadata."""
    llm_output = json.dumps({
        "feedback": "Strong explanation of the caching architecture.",
        "next_question": "How did you handle cache invalidation under high concurrency?",
        "emotion": "challenging",
        "delivery": {"pace": "deliberate", "energy": "high", "pause_after": True},
        "adjusted_difficulty": "Hard",
    })

    with patch("spark.interview._llm", return_value=llm_output):
        turn = next_interview_turn(
            target_role="Backend Engineer",
            target_company="Stripe",
            round_type="Technical Deep-Dive",
            difficulty="Medium",
            history=[{"q": "Tell me about your project", "a": "I designed a distributed cache."}],
            last_answer="I used Redis with a TTL and read-through caching.",
        )
        assert turn["emotion"] == "challenging"
        assert turn["delivery"]["pace"] == "deliberate"
        assert turn["adjusted_difficulty"] == "Hard"
        assert "cache invalidation" in turn["next_question"]


def test_next_interview_turn_legacy_normalization():
    """Legacy LLM responses missing emotion and delivery are normalized backward-compatibly."""
    legacy_output = json.dumps({
        "feedback": "Clear answer.",
        "next_question": "What tools did you use?",
        "adjusted_difficulty": "Medium",
    })

    with patch("spark.interview._llm", return_value=legacy_output):
        turn = next_interview_turn(
            target_role="Frontend Engineer",
            round_type="Technical Deep-Dive",
            difficulty="Medium",
            last_answer="A detailed response of sufficient length to trigger curious emotion normalization.",
        )
        assert turn["emotion"] in ALLOWED_EMOTIONS
        assert isinstance(turn["delivery"], dict)
        assert "pace" in turn["delivery"]
        assert "energy" in turn["delivery"]


def test_next_interview_turn_fallback_on_exception():
    """If LLM call fails, the deterministic fallback produces valid emotion and delivery."""
    with patch("spark.interview._llm", side_effect=RuntimeError("API quota exceeded")):
        turn = next_interview_turn(
            target_role="Data Engineer",
            difficulty="Medium",
            last_answer="Very short answer",
        )
        assert turn["emotion"] == "encouraging"
        assert turn["delivery"]["pace"] == "natural"
        assert "next_question" in turn
        assert "feedback" in turn


# ==============================================================================
# SECTION 4: API Endpoints & Session Isolation
# ==============================================================================

def test_api_tts_endpoint(auth_user):
    """POST /api/tts accepts text, emotion, and delivery and returns audio or availability."""
    client = TestClient(app)

    with patch("spark.main.get_tts_provider") as mock_get_provider:
        mock_provider = MagicMock()
        mock_provider.synthesize.return_value = TTSResult(
            audio_bytes=b"sample_tts_mp3_data",
            media_type="audio/mpeg",
            available=True,
            provider_name="current",
        )
        mock_get_provider.return_value = mock_provider

        res = client.post(
            "/api/tts",
            headers=auth_user["headers"],
            json={
                "text": "Hello candidate, walk me through your solution.",
                "emotion": "warm",
                "delivery": {"pace": "natural", "energy": "medium"},
            },
        )
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("audio/mpeg")
        assert res.content == b"sample_tts_mp3_data"
        mock_provider.synthesize.assert_called_once_with(
            text="Hello candidate, walk me through your solution.",
            emotion="warm",
            delivery={"pace": "natural", "energy": "medium"},
            voice_id=None,
        )


def test_api_start_interview_initial_turn_emotion(auth_user):
    """POST /api/interview/start creates opening turn with 'warm' emotion and delivery."""
    client = TestClient(app)

    with patch("spark.interview._llm", return_value="Welcome! Tell me about your background."):
        res = client.post(
            "/api/interview/start",
            headers=auth_user["headers"],
            json={
                "target_role": "Staff Software Engineer",
                "target_company": "Google",
                "round_type": "Technical Deep-Dive",
                "difficulty": "Hard",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["target_role"] == "Staff Software Engineer"
        assert len(data["turns"]) == 1
        opening_turn = data["turns"][0]
        assert opening_turn["emotion"] == "warm"
        assert isinstance(opening_turn["delivery"], dict)
        assert opening_turn["delivery"]["pause_after"] is True


def test_api_answer_interview_preserves_emotion_in_db(auth_user):
    """POST /api/interview/answer generates and persists emotion and delivery in DB turns_json."""
    client = TestClient(app)

    # 1. Start session
    with patch("spark.interview._llm", return_value="Opening question"):
        start_res = client.post(
            "/api/interview/start",
            headers=auth_user["headers"],
            json={"target_role": "Engineering Manager"},
        )
        assert start_res.status_code == 200
        sess_id = start_res.json()["id"]

    # 2. Answer turn with mocked LLM next turn
    mock_turn_response = json.dumps({
        "feedback": "Good leadership perspective.",
        "next_question": "How do you handle underperforming engineers on critical paths?",
        "emotion": "firm",
        "delivery": {"pace": "deliberate", "energy": "medium", "pause_after": True},
        "adjusted_difficulty": "Hard",
    })

    with patch("spark.interview._llm", return_value=mock_turn_response):
        ans_res = client.post(
            "/api/interview/answer",
            headers=auth_user["headers"],
            json={
                "session_id": sess_id,
                "answer_text": "I set clear expectations, run weekly 1-on-1s, and provide direct feedback.",
            },
        )
        assert ans_res.status_code == 200
        data = ans_res.json()
        assert len(data["turns"]) == 2
        last_turn = data["turns"][-1]
        assert last_turn["emotion"] == "firm"
        assert last_turn["delivery"]["pace"] == "deliberate"

    # 3. Verify session in DB directly
    with get_session() as session:
        db_sess = session.get(InterviewSession, sess_id)
        assert db_sess is not None
        turns = json.loads(db_sess.turns_json)
        assert len(turns) == 2
        assert turns[0]["emotion"] == "warm"
        assert turns[1]["emotion"] == "firm"
        assert turns[1]["delivery"]["energy"] == "medium"
