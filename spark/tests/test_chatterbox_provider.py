"""Comprehensive test suite for Chatterbox Turbo TTS Provider Adapter (Phase B).

Verifies all 16 Phase B requirements (A through P):
A. Chatterbox provider construction
B. Correct server-side URL usage
C. Bearer authentication
D. Correct request payload
E. Successful HTTP 200 audio response
F. Invalid HTTP response (500, 502, etc.)
G. Bounded timeout
H. Malformed audio response
I. Missing configuration (URL/Token)
J. Chatterbox disabled by default
K. Current provider remains production default
L. Automatic fallback to CurrentTTSProvider
M. Chatterbox failure does not break Coach API (/api/tts)
N. Secret never appears in logs
O. Browser/frontend cannot access Chatterbox token
P. No duplicate TTS requests introduced (zero retry loops)
"""
import io
import os
import sys
import wave
import logging
from unittest.mock import patch, MagicMock
import httpx
import pytest
from fastapi.testclient import TestClient

# Ensure src package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

test_db_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_chatterbox_tmp.db"))
if os.path.exists(test_db_file):
    try:
        os.remove(test_db_file)
    except Exception:
        pass

os.environ["DATABASE_URL"] = f"sqlite:///{test_db_file}"

from spark.config import get_settings
from spark.tts import (
    BaseTTSProvider,
    TTSResult,
    CurrentTTSProvider,
    ChatterboxProvider,
    get_tts_provider,
)
from spark.models import User, get_session, init_db
from spark.auth import hash_password, make_token
from spark.main import app


def generate_mock_wav(duration_frames: int = 2400) -> bytes:
    """Generate minimal valid 24 kHz mono 16-bit PCM WAV bytes."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(b"\x00\x00" * duration_frames)
    return buf.getvalue()


MOCK_WAV = generate_mock_wav()
MOCK_GPU_URL = "https://mock-chatterbox.modal.run"
MOCK_TOKEN = "chatterbox-super-secret-token-xyz"


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """Initialize isolated clean database schema for the test session."""
    init_db()
    yield
    if os.path.exists(test_db_file):
        try:
            os.remove(test_db_file)
        except Exception:
            pass


@pytest.fixture(autouse=True)
def reset_settings_and_cache():
    """Ensure clean settings before and after each test."""
    get_settings.cache_clear()
    get_tts_provider.cache_clear()
    yield
    get_settings.cache_clear()
    get_tts_provider.cache_clear()


@pytest.fixture
def auth_header():
    """Create test candidate and generate Bearer JWT token."""
    suffix = os.urandom(4).hex()
    email = f"candidate_cb_{suffix}@sparkdhi.ai"
    with get_session() as session:
        u = User(
            external_id=f"ext_cb_{suffix}",
            email=email,
            name="Chatterbox Test User",
            hashed_password=hash_password("StrongCandidate123!"),
            is_active=True,
            is_verified=True,
        )
        session.add(u)
        session.commit()
        session.refresh(u)

    token = make_token(u)
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# REQUIREMENT A: Provider Construction
# ==============================================================================
def test_requirement_a_provider_construction():
    """ChatterboxProvider instantiates cleanly as a BaseTTSProvider."""
    provider = ChatterboxProvider()
    assert isinstance(provider, BaseTTSProvider)
    assert isinstance(provider._fallback, CurrentTTSProvider)


# ==============================================================================
# REQUIREMENT B & C & D: URL, Bearer Auth, Request Payload
# ==============================================================================
def test_requirements_b_c_d_url_auth_payload(monkeypatch):
    """Verifies correct endpoint URL, Bearer auth header, and request payload."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    captured_request = {}

    def mock_post(url, **kwargs):
        captured_request["url"] = url
        captured_request["headers"] = kwargs.get("headers", {})
        captured_request["json"] = kwargs.get("json", {})
        captured_request["timeout"] = kwargs.get("timeout")
        return httpx.Response(
            200,
            content=MOCK_WAV,
            headers={"content-type": "audio/wav", "x-request-id": "req-123"},
        )

    with patch("httpx.post", side_effect=mock_post):
        result = provider.synthesize(
            text="Tell me about yourself.",
            emotion="warm",
            delivery={"intensity": 0.7, "request_id": "req-custom-001"},
            voice_id="default",
        )

        assert result.available is True
        assert result.provider_name == "chatterbox"
        assert result.media_type == "audio/wav"

        # Check URL
        assert captured_request["url"] == f"{MOCK_GPU_URL}/v1/tts"
        # Check Bearer Auth Header
        assert captured_request["headers"].get("Authorization") == f"Bearer {MOCK_TOKEN}"
        # Check Payload
        payload = captured_request["json"]
        assert payload["text"] == "Tell me about yourself."
        assert payload["voice"] == "default"
        assert payload["emotion"] == "warm"
        assert payload["intensity"] == 0.7
        assert payload["language"] == "en"
        assert payload["request_id"] == "req-custom-001"


# ==============================================================================
# REQUIREMENT E: Successful HTTP 200 Audio Response
# ==============================================================================
def test_requirement_e_successful_http_200(monkeypatch):
    """Successful HTTP 200 WAV response parses metadata and returns valid audio."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    resp_headers = {
        "content-type": "audio/wav",
        "x-request-id": "trace-uuid-456",
        "x-audio-duration-seconds": "3.5",
        "x-inference-time-ms": "1200.0",
        "x-real-time-factor": "0.34",
        "x-peak-vram-mb": "2850.0",
    }

    with patch("httpx.post") as mock_post:
        mock_post.return_value = httpx.Response(200, content=MOCK_WAV, headers=resp_headers)
        res = provider.synthesize("Great job on that project.", emotion="encouraging")

        assert res.available is True
        assert res.provider_name == "chatterbox"
        assert res.media_type == "audio/wav"
        assert res.audio_bytes == MOCK_WAV
        assert res.metadata["roundtrip_ms"] >= 0.0
        assert res.metadata["audio_duration_s"] == "3.5"
        assert res.metadata["rtf"] == "0.34"
        assert res.metadata["peak_vram_mb"] == "2850.0"


# ==============================================================================
# REQUIREMENT F: Invalid HTTP Response
# ==============================================================================
@pytest.mark.parametrize("status_code", [400, 401, 500, 502, 503])
def test_requirement_f_invalid_http_response(monkeypatch, status_code):
    """HTTP error codes automatically fall back to CurrentTTSProvider."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    with patch("httpx.post") as mock_post, \
         patch.object(provider._fallback, "synthesize") as mock_fallback:
        mock_post.return_value = httpx.Response(status_code, content=b"Server error")
        mock_fallback.return_value = TTSResult(
            audio_bytes=b"fallback_mp3",
            media_type="audio/mpeg",
            available=True,
            provider_name="current",
        )

        res = provider.synthesize("Interview question")
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback") is True
        assert res.metadata.get("chatterbox_fallback_reason") == f"http_error_{status_code}"
        assert res.audio_bytes == b"fallback_mp3"
        mock_fallback.assert_called_once()


# ==============================================================================
# REQUIREMENT G: Bounded Timeout
# ==============================================================================
def test_requirement_g_bounded_timeout(monkeypatch):
    """Remote timeout triggers safe, immediate fallback without hanging."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    monkeypatch.setenv("SPARK_CHATTERBOX_TIMEOUT_SECONDS", "3.0")
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    with patch("httpx.post", side_effect=httpx.TimeoutException("Read timed out")) as mock_post, \
         patch.object(provider._fallback, "synthesize") as mock_fallback:
        mock_fallback.return_value = TTSResult(
            audio_bytes=b"fallback_timeout_mp3",
            media_type="audio/mpeg",
            available=True,
            provider_name="current",
        )

        res = provider.synthesize("Tell me more about your architecture.")
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback_reason") == "timeout"
        assert res.audio_bytes == b"fallback_timeout_mp3"
        mock_fallback.assert_called_once()


# ==============================================================================
# REQUIREMENT H: Malformed Audio Response
# ==============================================================================
def test_requirement_h_malformed_audio(monkeypatch):
    """Malformed or non-WAV response triggers safe fallback."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    with patch("httpx.post") as mock_post, \
         patch.object(provider._fallback, "synthesize") as mock_fallback:
        # Returns 200 with HTML error text instead of binary WAV
        mock_post.return_value = httpx.Response(200, content=b"<html>Internal Proxy Error</html>", headers={"content-type": "text/html"})
        mock_fallback.return_value = TTSResult(
            audio_bytes=b"fallback_mp3",
            media_type="audio/mpeg",
            available=True,
            provider_name="current",
        )

        res = provider.synthesize("Testing malformed response.")
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback_reason") == "malformed_audio"
        mock_fallback.assert_called_once()


# ==============================================================================
# REQUIREMENT I: Missing Configuration
# ==============================================================================
def test_requirement_i_missing_configuration(monkeypatch):
    """Enabled flag without URL or Token safely falls back."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.delenv("SPARK_CHATTERBOX_URL", raising=False)
    monkeypatch.delenv("SPARK_CHATTERBOX_TOKEN", raising=False)
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    with patch.object(provider._fallback, "synthesize") as mock_fallback, \
         patch("httpx.post") as mock_post:
        mock_fallback.return_value = TTSResult(available=True, audio_bytes=b"fallback")
        res = provider.synthesize("Hello")

        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback_reason") == "missing_configuration"
        mock_post.assert_not_called()
        mock_fallback.assert_called_once()


# ==============================================================================
# REQUIREMENT J: Chatterbox Disabled by Default
# ==============================================================================
def test_requirement_j_chatterbox_disabled(monkeypatch):
    """When SPARK_CHATTERBOX_ENABLED is false, routes directly to fallback."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "false")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    with patch.object(provider._fallback, "synthesize") as mock_fallback, \
         patch("httpx.post") as mock_post:
        mock_fallback.return_value = TTSResult(available=True, audio_bytes=b"fallback")
        res = provider.synthesize("Hello")

        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback_reason") == "disabled"
        mock_post.assert_not_called()
        mock_fallback.assert_called_once()


# ==============================================================================
# REQUIREMENT K: Current Provider Remains Default
# ==============================================================================
def test_requirement_k_current_provider_remains_default(monkeypatch):
    """Default configuration returns CurrentTTSProvider."""
    monkeypatch.delenv("SPARK_TTS_PROVIDER", raising=False)
    monkeypatch.delenv("TTS_PROVIDER", raising=False)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    provider = get_tts_provider()
    assert isinstance(provider, CurrentTTSProvider)
    assert not isinstance(provider, ChatterboxProvider)


# ==============================================================================
# REQUIREMENT L: Automatic Fallback to Current Provider
# ==============================================================================
def test_requirement_l_automatic_fallback_execution(monkeypatch):
    """When Chatterbox fails, CurrentTTSProvider synthesize executes and produces audio."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    monkeypatch.setenv("MINIMAX_API_KEY", "test-minimax-key")
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    def mock_post(url, **kwargs):
        if "modal.run" in str(url):
            raise httpx.ConnectError("Connection refused")
        elif "minimax.io" in str(url):
            return httpx.Response(200, json={"data": {"audio": {"audio_file": b"minimax_fallback_audio".hex()}}})
        return httpx.Response(500, content=b"Server error")

    with patch("httpx.post", side_effect=mock_post):
        res = provider.synthesize("Fallback test sentence.")
        assert res.available is True
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback") is True
        assert res.audio_bytes == b"minimax_fallback_audio"


# ==============================================================================
# REQUIREMENT M: Chatterbox Failure Does Not Break Coach API (/api/tts)
# ==============================================================================
def test_requirement_m_coach_api_survives_chatterbox_failure(auth_header, monkeypatch):
    """Coach /api/tts endpoint returns HTTP 200 audio even if Chatterbox service throws 500."""
    monkeypatch.setenv("SPARK_TTS_PROVIDER", "chatterbox")
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    monkeypatch.setenv("MINIMAX_API_KEY", "test-minimax-key")
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    client = TestClient(app)

    def mock_post(url, **kwargs):
        if "modal.run" in str(url):
            return httpx.Response(500, content=b"CUDA Out of Memory")
        elif "minimax.io" in str(url):
            return httpx.Response(200, json={"data": {"audio": {"audio_file": b"minimax_coach_audio".hex()}}})
        return httpx.Response(500, content=b"Error")

    with patch("httpx.post", side_effect=mock_post):
        resp = client.post(
            "/api/tts",
            headers=auth_header,
            json={"text": "How did you manage technical debt on your team?", "emotion": "curious"},
        )

        assert resp.status_code == 200
        # Should return audio (fallback audio/mpeg or gTTS)
        assert resp.headers["content-type"] in ("audio/mpeg", "audio/wav")
        assert resp.content == b"minimax_coach_audio"


# ==============================================================================
# REQUIREMENT N: Secret Never Appears in Logs
# ==============================================================================
def test_requirement_n_secret_never_logged(caplog, monkeypatch):
    """Verify that SPARK_CHATTERBOX_TOKEN is never logged in stdout/logger."""
    secret_token = "ultra-secret-key-that-must-never-be-logged"
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", secret_token)
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    with caplog.at_level(logging.DEBUG), \
         patch("httpx.post", side_effect=httpx.TimeoutException("Timeout")):
        provider.synthesize("Testing log security.")

    for record in caplog.records:
        assert secret_token not in record.message
        assert secret_token not in str(record.args)


# ==============================================================================
# REQUIREMENT O: Browser/Frontend Cannot Access Chatterbox Token
# ==============================================================================
def test_requirement_o_frontend_cannot_access_token(auth_header, monkeypatch):
    """The /api/tts endpoint response never returns the server-side token to frontend."""
    secret_token = "secret-token-not-for-browser"
    monkeypatch.setenv("SPARK_TTS_PROVIDER", "chatterbox")
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", secret_token)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    client = TestClient(app)

    with patch("httpx.post") as mock_post:
        mock_post.return_value = httpx.Response(
            200,
            content=MOCK_WAV,
            headers={"content-type": "audio/wav", "x-request-id": "req-safe"},
        )

        resp = client.post(
            "/api/tts",
            headers=auth_header,
            json={"text": "Frontend security test."},
        )

        assert resp.status_code == 200
        assert secret_token.encode("utf-8") not in resp.content
        for key, val in resp.headers.items():
            assert secret_token not in val


# ==============================================================================
# REQUIREMENT P: No Duplicate TTS Requests Introduced
# ==============================================================================
def test_requirement_p_no_duplicate_requests(monkeypatch):
    """One synthesize call makes exactly one remote request without retry loops."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    with patch("httpx.post") as mock_post, \
         patch.object(provider._fallback, "synthesize") as mock_fallback:
        mock_post.return_value = httpx.Response(500, content=b"Server error")
        mock_fallback.return_value = TTSResult(available=True, audio_bytes=b"fallback")

        provider.synthesize("Single request test.")
        # Exactly 1 attempt made to remote service; no retry loop
        assert mock_post.call_count == 1
        assert mock_fallback.call_count == 1


# ==============================================================================
# SECTION 17: PHASE D3 AUDIT & SCENARIO VALIDATION TESTS
# ==============================================================================

def test_d3_chatterbox_success(monkeypatch):
    """Scenario 1: Chatterbox returns 200 OK + valid 24 kHz WAV audio."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()

    provider = ChatterboxProvider()
    resp_headers = {
        "content-type": "audio/wav",
        "x-request-id": "d3-test-success-01",
        "x-audio-duration-seconds": "4.2",
        "x-inference-time-ms": "1850.0",
        "x-real-time-factor": "0.44",
        "x-peak-vram-mb": "2824.6",
    }

    with patch("httpx.post") as mock_post:
        mock_post.return_value = httpx.Response(200, content=MOCK_WAV, headers=resp_headers)
        res = provider.synthesize("Tell me about your technical background.", emotion="neutral")

        assert res.available is True
        assert res.provider_name == "chatterbox"
        assert res.media_type == "audio/wav"
        assert res.audio_bytes == MOCK_WAV
        assert res.metadata["rtf"] == "0.44"
        assert res.metadata["peak_vram_mb"] == "2824.6"


def test_d3_chatterbox_401_fallback(monkeypatch):
    """Scenario 2: Chatterbox returns 401 Unauthorized -> seamless fallback."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", "bad-or-expired-token")
    monkeypatch.setenv("MINIMAX_API_KEY", "test-minimax-key")
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    def mock_post(url, **kwargs):
        if "modal.run" in str(url):
            return httpx.Response(401, json={"detail": {"error": "UNAUTHORIZED", "message": "Invalid API key."}})
        elif "minimax.io" in str(url):
            return httpx.Response(200, json={"data": {"audio": {"audio_file": b"minimax_401_fallback_audio".hex()}}})
        return httpx.Response(500, content=b"Error")

    with patch("httpx.post", side_effect=mock_post):
        res = provider.synthesize("Interview prompt testing 401 fallback.")
        assert res.available is True
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback") is True
        assert res.metadata.get("chatterbox_fallback_reason") == "http_error_401"
        assert res.audio_bytes == b"minimax_401_fallback_audio"


def test_d3_chatterbox_500_fallback(monkeypatch):
    """Scenario 3: Chatterbox returns 500 Internal Server Error -> seamless fallback."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    monkeypatch.setenv("MINIMAX_API_KEY", "test-minimax-key")
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    def mock_post(url, **kwargs):
        if "modal.run" in str(url):
            return httpx.Response(500, json={"error": "INFERENCE_FAILED", "message": "Audio synthesis failed on GPU worker."})
        elif "minimax.io" in str(url):
            return httpx.Response(200, json={"data": {"audio": {"audio_file": b"minimax_500_fallback_audio".hex()}}})
        return httpx.Response(500, content=b"Error")

    with patch("httpx.post", side_effect=mock_post):
        res = provider.synthesize("Interview prompt testing 500 fallback.")
        assert res.available is True
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback") is True
        assert res.metadata.get("chatterbox_fallback_reason") == "http_error_500"
        assert res.audio_bytes == b"minimax_500_fallback_audio"


def test_d3_chatterbox_timeout_fallback(monkeypatch):
    """Scenario 4: Chatterbox request times out -> seamless fallback."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    monkeypatch.setenv("MINIMAX_API_KEY", "test-minimax-key")
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    def mock_post(url, **kwargs):
        if "modal.run" in str(url):
            raise httpx.TimeoutException("Read timed out on GPU host")
        elif "minimax.io" in str(url):
            return httpx.Response(200, json={"data": {"audio": {"audio_file": b"minimax_timeout_fallback_audio".hex()}}})
        return httpx.Response(500, content=b"Error")

    with patch("httpx.post", side_effect=mock_post):
        res = provider.synthesize("Interview prompt testing timeout fallback.")
        assert res.available is True
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback") is True
        assert res.metadata.get("chatterbox_fallback_reason") == "timeout"
        assert res.audio_bytes == b"minimax_timeout_fallback_audio"


def test_d3_chatterbox_malformed_response_fallback(monkeypatch):
    """Scenario 5: Chatterbox returns malformed/non-WAV response -> seamless fallback."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    monkeypatch.setenv("MINIMAX_API_KEY", "test-minimax-key")
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    def mock_post(url, **kwargs):
        if "modal.run" in str(url):
            return httpx.Response(200, content=b"RIFF\x00\x00\x00\x00TRUNCATED", headers={"content-type": "audio/wav"})
        elif "minimax.io" in str(url):
            return httpx.Response(200, json={"data": {"audio": {"audio_file": b"minimax_malformed_fallback_audio".hex()}}})
        return httpx.Response(500, content=b"Error")

    with patch("httpx.post", side_effect=mock_post):
        res = provider.synthesize("Interview prompt testing malformed audio fallback.")
        assert res.available is True
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback") is True
        assert res.metadata.get("chatterbox_fallback_reason") == "malformed_audio"
        assert res.audio_bytes == b"minimax_malformed_fallback_audio"


def test_d3_chatterbox_fallback_to_minimax(monkeypatch):
    """Scenario 6: Fallback to MiniMax explicitly verified when Chatterbox is unreachable."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    monkeypatch.setenv("MINIMAX_API_KEY", "test-minimax-key")
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    def mock_post(url, **kwargs):
        if "modal.run" in str(url):
            raise httpx.ConnectError("Network route unreachable")
        elif "minimax.io" in str(url):
            return httpx.Response(200, json={"data": {"audio": {"audio_file": b"minimax_live_waterfall_mp3".hex()}}})
        return httpx.Response(500, content=b"Error")

    with patch("httpx.post", side_effect=mock_post):
        res = provider.synthesize("Verifying MiniMax primary fallback.")
        assert res.available is True
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback") is True
        assert res.metadata.get("engine") == "minimax"
        assert res.audio_bytes == b"minimax_live_waterfall_mp3"


def test_d3_chatterbox_english_routing(monkeypatch):
    """Scenario 7: English prompt text is routed to Chatterbox microservice."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()

    provider = ChatterboxProvider()
    captured_urls = []

    def mock_post(url, **kwargs):
        captured_urls.append(str(url))
        return httpx.Response(200, content=MOCK_WAV, headers={"content-type": "audio/wav"})

    with patch("httpx.post", side_effect=mock_post):
        res = provider.synthesize("Tell me about a challenging project.", delivery={"language": "en"})
        assert res.available is True
        assert res.provider_name == "chatterbox"
        assert len(captured_urls) == 1
        assert "modal.run" in captured_urls[0]


def test_d3_chatterbox_non_english_routing(monkeypatch):
    """Scenario 8: Hindi / non-English text bypasses Chatterbox and routes directly to fallback."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", MOCK_GPU_URL)
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    monkeypatch.setenv("MINIMAX_API_KEY", "test-minimax-key")
    get_settings.cache_clear()

    provider = ChatterboxProvider()
    captured_urls = []

    def mock_post(url, **kwargs):
        captured_urls.append(str(url))
        if "minimax.io" in str(url):
            return httpx.Response(200, json={"data": {"audio": {"audio_file": b"hindi_minimax_audio".hex()}}})
        return httpx.Response(500, content=b"Error")

    with patch("httpx.post", side_effect=mock_post):
        # Prompt contains Devanagari Hindi text
        res = provider.synthesize("नमस्ते, अपने बारे में कुछ बताएं।", delivery={"language": "hi"})
        assert res.available is True
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback_reason") == "unsupported_language"
        # Zero requests sent to Chatterbox GPU service
        for u in captured_urls:
            assert "modal.run" not in u
        assert res.audio_bytes == b"hindi_minimax_audio"


def test_d3_chatterbox_existing_provider_unchanged(monkeypatch):
    """Scenario 9: Default configuration strictly retains CurrentTTSProvider unchanged."""
    monkeypatch.delenv("SPARK_TTS_PROVIDER", raising=False)
    monkeypatch.delenv("TTS_PROVIDER", raising=False)
    monkeypatch.delenv("SPARK_CHATTERBOX_ENABLED", raising=False)
    monkeypatch.delenv("CHATTERBOX_ENABLED", raising=False)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    provider = get_tts_provider()
    assert isinstance(provider, CurrentTTSProvider)
    assert not isinstance(provider, ChatterboxProvider)


# ==============================================================================
# PHASE 1 FOCUSED VERIFICATION SCENARIOS (A THROUGH H)
# ==============================================================================

def test_phase1_scenario_a_chatterbox_disabled_selects_existing(monkeypatch):
    """A. Chatterbox disabled -> existing provider selected."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "false")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", "https://anvikchenna--spark-chatterbox-turbo-chatterboxservice-web.modal.run")
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    provider = get_tts_provider()
    assert isinstance(provider, CurrentTTSProvider)
    assert not isinstance(provider, ChatterboxProvider)


def test_phase1_scenario_b_chatterbox_enabled_url_configured_selects_chatterbox(monkeypatch):
    """B. Chatterbox enabled + URL configured -> ChatterboxProvider selected."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", "https://anvikchenna--spark-chatterbox-turbo-chatterboxservice-web.modal.run")
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    provider = get_tts_provider()
    assert isinstance(provider, ChatterboxProvider)
    assert not isinstance(provider, CurrentTTSProvider)



def test_phase1_scenario_c_chatterbox_successful_response(monkeypatch):
    """C. Chatterbox successful response -> audio returned correctly."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", "https://anvikchenna--spark-chatterbox-turbo-chatterboxservice-web.modal.run")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    provider = get_tts_provider()

    def mock_post(url, **kwargs):
        return httpx.Response(
            200,
            content=MOCK_WAV,
            headers={"content-type": "audio/wav", "x-request-id": "req-phase1-c"},
        )

    with patch("httpx.post", side_effect=mock_post):
        res = provider.synthesize("Welcome to your mock interview.")
        assert res.available is True
        assert res.provider_name == "chatterbox"
        assert res.media_type == "audio/wav"
        assert res.audio_bytes == MOCK_WAV


def test_phase1_scenario_d_chatterbox_http_500_fallback(monkeypatch):
    """D. Chatterbox HTTP 500 -> fallback activated."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", "https://anvikchenna--spark-chatterbox-turbo-chatterboxservice-web.modal.run")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    provider = get_tts_provider()

    with patch("httpx.post", return_value=httpx.Response(500, content=b"Internal GPU Error")):
        with patch.object(provider._fallback, "synthesize") as mock_fallback:
            mock_fallback.return_value = TTSResult(available=True, audio_bytes=b"fallback_mp3", media_type="audio/mpeg")
            res = provider.synthesize("Explain quicksort.")
            assert res.provider_name == "chatterbox_fallback"
            assert res.metadata.get("chatterbox_fallback_reason") == "http_error_500"
            assert res.audio_bytes == b"fallback_mp3"
            mock_fallback.assert_called_once()


def test_phase1_scenario_e_chatterbox_timeout_fallback(monkeypatch):
    """E. Chatterbox timeout -> fallback activated."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", "https://anvikchenna--spark-chatterbox-turbo-chatterboxservice-web.modal.run")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    provider = get_tts_provider()

    with patch("httpx.post", side_effect=httpx.TimeoutException("Remote invocation timed out")):
        with patch.object(provider._fallback, "synthesize") as mock_fallback:
            mock_fallback.return_value = TTSResult(available=True, audio_bytes=b"fallback_mp3", media_type="audio/mpeg")
            res = provider.synthesize("Tell me about a time you failed.")
            assert res.provider_name == "chatterbox_fallback"
            assert res.metadata.get("chatterbox_fallback_reason") == "timeout"
            assert res.audio_bytes == b"fallback_mp3"
            mock_fallback.assert_called_once()


def test_phase1_scenario_f_chatterbox_malformed_response_fallback(monkeypatch):
    """F. Malformed Chatterbox response -> fallback activated."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", "https://anvikchenna--spark-chatterbox-turbo-chatterboxservice-web.modal.run")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    provider = get_tts_provider()

    with patch("httpx.post", return_value=httpx.Response(200, content=b"corrupted_non_wav_bytes", headers={"content-type": "audio/wav"})):
        with patch.object(provider._fallback, "synthesize") as mock_fallback:
            mock_fallback.return_value = TTSResult(available=True, audio_bytes=b"fallback_mp3", media_type="audio/mpeg")
            res = provider.synthesize("Testing malformed response.")
            assert res.provider_name == "chatterbox_fallback"
            assert res.metadata.get("chatterbox_fallback_reason") == "malformed_audio"
            assert res.audio_bytes == b"fallback_mp3"
            mock_fallback.assert_called_once()


def test_phase1_scenario_g_emotion_delivery_forwarded(monkeypatch):
    """G. Emotion/delivery forwarded correctly."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", "https://anvikchenna--spark-chatterbox-turbo-chatterboxservice-web.modal.run")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_TOKEN)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    provider = get_tts_provider()
    captured_json = {}

    def mock_post(url, **kwargs):
        captured_json.update(kwargs.get("json", {}))
        return httpx.Response(200, content=MOCK_WAV, headers={"content-type": "audio/wav"})

    with patch("httpx.post", side_effect=mock_post):
        provider.synthesize(
            text="That was an interesting solution.",
            emotion="curious",
            delivery={"intensity": 0.8, "request_id": "test-req-g"},
        )
        assert captured_json["emotion"] == "curious"
        assert captured_json["intensity"] == 0.8
        assert captured_json["request_id"] == "test-req-g"
        assert captured_json["language"] == "en"


def test_phase1_scenario_h_missing_configuration_retains_functional_provider(monkeypatch):
    """H. Missing Chatterbox configuration -> existing provider remains functional."""
    monkeypatch.delenv("SPARK_CHATTERBOX_ENABLED", raising=False)
    monkeypatch.delenv("CHATTERBOX_ENABLED", raising=False)
    monkeypatch.delenv("SPARK_CHATTERBOX_URL", raising=False)
    monkeypatch.delenv("CHATTERBOX_URL", raising=False)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    provider = get_tts_provider()
    assert isinstance(provider, CurrentTTSProvider)
    # Synthesize remains fully functional
    with patch("importlib.import_module") as mock_import:
        mock_gtts_mod = MagicMock()
        mock_gtts_cls = MagicMock()
        mock_obj = MagicMock()
        mock_obj.write_to_fp.side_effect = lambda buf: buf.write(b"gtts_audio_bytes")
        mock_gtts_cls.return_value = mock_obj
        mock_gtts_mod.gTTS = mock_gtts_cls
        mock_import.return_value = mock_gtts_mod

        res = provider.synthesize("Hello world")
        assert res.available is True
        assert res.provider_name == "current"
        assert res.audio_bytes == b"gtts_audio_bytes"


