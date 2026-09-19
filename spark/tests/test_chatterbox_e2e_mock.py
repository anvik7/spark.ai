"""Phase C: End-to-End Local Mock Integration Test Suite.

Proves the complete flow:
SparkDhi Coach -> BaseTTSProvider -> ChatterboxProvider -> Local Mock HTTP Service -> 24 kHz WAV -> Coach Audio Path
WITHOUT requiring an external GPU service and WITHOUT touching production.

Verifies:
A. Authorized successful request -> HTTP 200 + valid 24 kHz WAV
B. Missing/invalid bearer token -> HTTP 401
C. Text >1200 characters -> validation failure (422) & truncation safety
D. Provider correctly sends emotion, intensity, language, paralinguistic fields
E. Response headers parsed into TTSResult metadata (RTF, inference_ms, peak_vram)
F. Provider handles service error correctly (HTTP 500 / 503)
G. Automatic fallback to existing production provider (CurrentTTSProvider)
H. Provider-disabled state immediately uses CurrentTTSProvider
"""
import io
import os
import sys
import time
import wave
import uuid
import socket
import threading
from typing import Optional, Dict, Any

import httpx
import pytest
from fastapi import FastAPI, Header, HTTPException, Response, Request, status
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

# Ensure spark package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Isolated test DB
test_db_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_chatterbox_e2e_tmp.db"))
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
from spark.main import app as coach_app

MOCK_PORT = 8765
MOCK_SERVICE_KEY = "mock-secret-key-phase-c-12345"


# ------------------------------------------------------------------------------
# 1. Helper: Generate valid 24 kHz mono 16-bit PCM WAV
# ------------------------------------------------------------------------------
def generate_valid_wav(duration_s: float = 0.2) -> bytes:
    """Generate genuine 24 kHz mono 16-bit PCM WAV bytes."""
    sr = 24000
    n_frames = int(sr * duration_s)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)      # Mono
        wf.setsampwidth(2)     # 16-bit (2 bytes)
        wf.setframerate(sr)    # 24 kHz
        wf.writeframes(b"\x00\x00" * n_frames)
    return buf.getvalue()


# ------------------------------------------------------------------------------
# 2. Mock Phase A HTTP Service Definition
# ------------------------------------------------------------------------------
mock_app = FastAPI(title="Phase A Mock Microservice")
recorded_requests = []


class MockTTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1200)
    voice: Optional[str] = "default"
    emotion: Optional[str] = "neutral"
    intensity: Optional[float] = 0.5
    language: Optional[str] = "en"
    paralinguistics: Optional[bool] = False
    request_id: Optional[str] = None


@mock_app.get("/health")
def mock_health():
    return {"status": "alive", "service": "chatterbox-turbo-service"}


@mock_app.get("/ready")
def mock_ready():
    return {"status": "ready", "gpu_available": True, "model_loaded": True}


@mock_app.post("/v1/tts")
async def mock_tts_endpoint(
    request: Request,
    authorization: Optional[str] = Header(None),
):
    # 1. Bearer Token Authentication
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "UNAUTHORIZED", "message": "Missing Bearer token."},
        )
    token = authorization[7:].strip()
    if token != MOCK_SERVICE_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "UNAUTHORIZED", "message": "Invalid API key."},
        )

    # 2. Parse and Validate Body
    body_json = await request.json()
    req_text = body_json.get("text", "")

    # Check 1200 max length bound
    if len(req_text) > 1200:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "VALIDATION_ERROR", "message": "Text exceeds 1200 characters."},
        )

    # Check language
    req_lang = body_json.get("language", "en")
    if req_lang != "en":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "VALIDATION_ERROR", "message": "Only 'en' supported."},
        )

    # Record payload for assertion
    recorded_requests.append(body_json)

    # 3. Simulate Failure Modes if requested
    sim_error = request.headers.get("x-simulate-error")
    if sim_error == "500":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "INFERENCE_FAILED", "message": "Simulated GPU inference failure."},
        )
    elif sim_error == "503":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "SERVICE_UNAVAILABLE", "message": "Simulated GPU busy."},
        )
    elif sim_error == "malformed":
        return Response(content=b"<!DOCTYPE html><html>Not A WAV</html>", media_type="text/html")

    # 4. Generate Valid 24 kHz WAV
    wav_bytes = generate_valid_wav(duration_s=0.25)
    req_id = body_json.get("request_id") or str(uuid.uuid4())

    headers = {
        "Content-Type": "audio/wav",
        "X-Request-Id": req_id,
        "X-Audio-Duration-Seconds": "0.25",
        "X-Inference-Time-Ms": "342.1",
        "X-Real-Time-Factor": "0.137",
        "X-Peak-VRAM-Mb": "2840.5",
    }
    return Response(content=wav_bytes, media_type="audio/wav", headers=headers)


# ------------------------------------------------------------------------------
# 3. Pytest Fixtures: In-Process Uvicorn Server & Database
# ------------------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def run_mock_server():
    """Start in-process local mock HTTP server on 127.0.0.1:8765."""
    import uvicorn

    config = uvicorn.Config(mock_app, host="127.0.0.1", port=MOCK_PORT, log_level="error")
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()

    # Wait for server to become responsive
    url = f"http://127.0.0.1:{MOCK_PORT}/health"
    ready = False
    for _ in range(30):
        try:
            r = httpx.get(url, timeout=1.0)
            if r.status_code == 200:
                ready = True
                break
        except Exception:
            time.sleep(0.1)

    assert ready, f"Failed to start local mock HTTP service on port {MOCK_PORT}"
    yield
    server.should_exit = True
    t.join(timeout=2.0)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    """Initialize test database."""
    init_db()
    yield
    if os.path.exists(test_db_file):
        try:
            os.remove(test_db_file)
        except Exception:
            pass


@pytest.fixture(autouse=True)
def reset_recorded(monkeypatch):
    """Reset recorded requests before and after each test, ensuring clean environment."""
    recorded_requests.clear()
    monkeypatch.delenv("SPARK_CHATTERBOX_ENABLED", raising=False)
    monkeypatch.delenv("SPARK_CHATTERBOX_URL", raising=False)
    monkeypatch.delenv("SPARK_CHATTERBOX_TOKEN", raising=False)
    monkeypatch.delenv("SPARK_TTS_PROVIDER", raising=False)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()
    yield
    recorded_requests.clear()
    get_settings.cache_clear()
    get_tts_provider.cache_clear()


@pytest.fixture
def auth_header():
    """Generate candidate user and JWT header for Coach /api/tts."""
    suffix = os.urandom(4).hex()
    email = f"candidate_e2e_{suffix}@sparkdhi.ai"
    with get_session() as session:
        u = User(
            external_id=f"ext_e2e_{suffix}",
            email=email,
            name="Phase C Candidate",
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
# TEST A: Authorized Successful Request -> HTTP 200 + Valid WAV
# ==============================================================================
def test_a_authorized_successful_request(auth_header, monkeypatch):
    """End-to-end: Coach /api/tts calls ChatterboxProvider -> local mock service -> returns valid 24 kHz WAV."""
    monkeypatch.setenv("SPARK_TTS_PROVIDER", "chatterbox")
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", f"http://127.0.0.1:{MOCK_PORT}")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_SERVICE_KEY)
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    client = TestClient(coach_app)

    prompt_text = "Tell me about a time you resolved a difficult conflict on your engineering team."
    payload = {
        "text": prompt_text,
        "emotion": "warm",
        "delivery": {"intensity": 0.6, "request_id": "req-phase-c-001"},
    }

    resp = client.post("/api/tts", headers=auth_header, json=payload)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"

    wav_data = resp.content
    assert len(wav_data) > 44

    # Validate WAV properties
    with wave.open(io.BytesIO(wav_data), "rb") as wf:
        assert wf.getnchannels() == 1       # Mono
        assert wf.getsampwidth() == 2      # 16-bit PCM
        assert wf.getframerate() == 24000  # 24 kHz
        assert wf.getnframes() > 0


# ==============================================================================
# TEST B: Missing / Invalid Bearer Token -> HTTP 401
# ==============================================================================
def test_b_unauthorized_token_rejection(auth_header, monkeypatch):
    """Mock service strictly rejects missing/invalid tokens with 401, triggering safe fallback."""
    # 1. Direct call to mock service without token
    r_unauth = httpx.post(f"http://127.0.0.1:{MOCK_PORT}/v1/tts", json={"text": "Hello"})
    assert r_unauth.status_code == 401
    assert "UNAUTHORIZED" in r_unauth.json()["detail"]["error"]

    # 2. Direct call to mock service with wrong token
    r_bad = httpx.post(
        f"http://127.0.0.1:{MOCK_PORT}/v1/tts",
        headers={"Authorization": "Bearer wrong-token-xyz"},
        json={"text": "Hello"},
    )
    assert r_bad.status_code == 401
    assert "UNAUTHORIZED" in r_bad.json()["detail"]["error"]

    # 3. Provider configured with invalid token falls back safely to CurrentTTSProvider
    monkeypatch.setenv("SPARK_TTS_PROVIDER", "chatterbox")
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", f"http://127.0.0.1:{MOCK_PORT}")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", "bad-token")
    get_settings.cache_clear()
    get_tts_provider.cache_clear()

    client = TestClient(coach_app)
    resp = client.post("/api/tts", headers=auth_header, json={"text": "Testing fallback on 401."})
    assert resp.status_code == 200
    # Returns audio via fallback
    assert len(resp.content) > 0


# ==============================================================================
# TEST C: Text > 1200 Characters -> Validation Failure / Truncation Safety
# ==============================================================================
def test_c_text_length_validation_and_truncation(monkeypatch):
    """Mock service rejects text >1200 characters with 422; Provider safely truncates before sending."""
    # 1. Direct call to mock with 1201 characters -> HTTP 422
    oversized_text = "A" * 1201
    r_oversized = httpx.post(
        f"http://127.0.0.1:{MOCK_PORT}/v1/tts",
        headers={"Authorization": f"Bearer {MOCK_SERVICE_KEY}"},
        json={"text": oversized_text},
    )
    assert r_oversized.status_code == 422

    # 2. ChatterboxProvider automatically clamps text to 1200 characters before sending
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", f"http://127.0.0.1:{MOCK_PORT}")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_SERVICE_KEY)
    get_settings.cache_clear()

    provider = ChatterboxProvider()
    huge_prompt = "Explain your architecture. " * 60  # >1400 chars
    res = provider.synthesize(huge_prompt)
    assert res.available is True
    assert recorded_requests[-1]["text"] == huge_prompt[:1200].strip()
    assert len(recorded_requests[-1]["text"]) <= 1200


# ==============================================================================
# TEST D: Provider Correctly Sends Emotion / Intensity / Language / Paralinguistics
# ==============================================================================
def test_d_provider_parameter_mapping(monkeypatch):
    """ChatterboxProvider correctly maps Coach emotion, intensity, language, and paralinguistics."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", f"http://127.0.0.1:{MOCK_PORT}")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_SERVICE_KEY)
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    prompt = "Well... that's very interesting. [chuckle] Tell me more about that."
    delivery = {
        "intensity": 0.75,
        "language": "en",
        "request_id": "custom-trace-req-042",
    }

    res = provider.synthesize(prompt, emotion="curious", delivery=delivery)
    assert res.available is True
    assert len(recorded_requests) == 1

    sent_body = recorded_requests[0]
    assert sent_body["text"] == prompt
    assert sent_body["emotion"] == "curious"
    assert sent_body["intensity"] == 0.75
    assert sent_body["language"] == "en"
    assert sent_body["paralinguistics"] is True  # Detected [chuckle]
    assert sent_body["request_id"] == "custom-trace-req-042"


# ==============================================================================
# TEST E: Response Headers are Parsed into TTSResult Metadata
# ==============================================================================
def test_e_response_headers_parsed_into_metadata(monkeypatch):
    """Response headers from mock service are captured in TTSResult metadata."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", f"http://127.0.0.1:{MOCK_PORT}")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_SERVICE_KEY)
    get_settings.cache_clear()

    provider = ChatterboxProvider()
    res = provider.synthesize("Tell me about your leadership style.")

    assert res.available is True
    assert res.provider_name == "chatterbox"
    assert res.media_type == "audio/wav"

    meta = res.metadata
    assert meta["engine"] == "chatterbox-turbo"
    assert meta["remote_inference_ms"] == "342.1"
    assert meta["rtf"] == "0.137"
    assert meta["peak_vram_mb"] == "2840.5"
    assert meta["audio_duration_s"] == "0.25"
    assert "roundtrip_ms" in meta
    assert float(meta["roundtrip_ms"]) > 0.0


# ==============================================================================
# TEST F: Provider Handles Service Error Correctly (HTTP 500 / 503)
# ==============================================================================
def test_f_service_error_handling(monkeypatch):
    """When the mock service returns HTTP 500 or 503, provider catches error without crashing."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", f"http://127.0.0.1:{MOCK_PORT}")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_SERVICE_KEY)
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    # Pass header via httpx client intercept to simulate 500
    with httpx_simulated_header({"x-simulate-error": "500"}):
        res = provider.synthesize("Testing 500 handling.")
        assert res.provider_name == "chatterbox_fallback"
        assert res.metadata.get("chatterbox_fallback") is True
        assert res.metadata.get("chatterbox_fallback_reason") == "http_error_500"


def httpx_simulated_header(extra_headers: Dict[str, str]):
    """Context manager to inject simulation headers into provider requests."""
    orig_post = httpx.post

    def patched_post(url, **kwargs):
        headers = kwargs.get("headers", {})
        headers.update(extra_headers)
        kwargs["headers"] = headers
        return orig_post(url, **kwargs)

    from unittest.mock import patch
    return patch("httpx.post", side_effect=patched_post)


# ==============================================================================
# TEST G: Provider Automatically Falls Back to Existing Production Provider
# ==============================================================================
def test_g_automatic_fallback_to_production_waterfall(monkeypatch):
    """When remote service fails, CurrentTTSProvider produces audio via production waterfall."""
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "true")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", f"http://127.0.0.1:{MOCK_PORT}")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_SERVICE_KEY)
    monkeypatch.setenv("MINIMAX_API_KEY", "test-minimax-key")
    get_settings.cache_clear()

    provider = ChatterboxProvider()

    orig_post = httpx.post

    def patched_post(url, **kwargs):
        if "minimax.io" in str(url):
            return httpx.Response(200, json={"data": {"audio": {"audio_file": b"minimax_e2e_fallback_audio".hex()}}})
        headers = kwargs.get("headers", {})
        headers["x-simulate-error"] = "503"
        kwargs["headers"] = headers
        return orig_post(url, **kwargs)

    from unittest.mock import patch
    with patch("httpx.post", side_effect=patched_post):
        res = provider.synthesize("Fallback to CurrentTTSProvider test.")
        assert res.available is True
        assert res.provider_name == "chatterbox_fallback"
        assert res.audio_bytes == b"minimax_e2e_fallback_audio"


# ==============================================================================
# TEST H: Provider-Disabled State Immediately Uses Current Production Provider
# ==============================================================================
def test_h_provider_disabled_state_behavior(monkeypatch):
    """When SPARK_CHATTERBOX_ENABLED=false, provider immediately delegates to CurrentTTSProvider."""
    monkeypatch.setenv("SPARK_TTS_PROVIDER", "chatterbox")
    monkeypatch.setenv("SPARK_CHATTERBOX_ENABLED", "false")
    monkeypatch.setenv("SPARK_CHATTERBOX_URL", f"http://127.0.0.1:{MOCK_PORT}")
    monkeypatch.setenv("SPARK_CHATTERBOX_TOKEN", MOCK_SERVICE_KEY)
    get_settings.cache_clear()

    provider = ChatterboxProvider()
    res = provider.synthesize("Disabled provider test.")

    assert res.provider_name == "chatterbox_fallback"
    assert res.metadata.get("chatterbox_fallback_reason") == "disabled"
    assert len(recorded_requests) == 0  # Zero requests sent to mock HTTP server
