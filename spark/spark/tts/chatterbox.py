"""Chatterbox Turbo GPU Microservice TTS Provider Adapter.

Integrates the SparkDhi Coach voice pipeline with an external Chatterbox Turbo
GPU microservice (Modal / RunPod / Docker) via BaseTTSProvider abstraction.

Safety guarantees:
1. Disabled by default (SPARK_CHATTERBOX_ENABLED=false).
2. Production default remains CurrentTTSProvider.
3. Automatic, seamless fallback to CurrentTTSProvider on timeout, error, or unconfigured state.
4. Server-to-server authenticated HTTPS requests (Bearer token never exposed to frontend or logs).
5. Bounded timeout (default 6.0s) prevents hanging interview sessions.
6. Zero local GPU dependencies inside Render.
"""
import logging
import re
import time
import uuid
from typing import Optional, Dict, Any, Tuple
import httpx

from ..config import get_settings
from .base import BaseTTSProvider, TTSResult
from .current import CurrentTTSProvider

logger = logging.getLogger("spark.tts.chatterbox")

# Supported Coach emotions mapped to Chatterbox intensity levels
EMOTION_INTENSITY_MAP: Dict[str, float] = {
    "neutral": 0.4,
    "warm": 0.6,
    "curious": 0.5,
    "encouraging": 0.6,
    "impressed": 0.6,
    "skeptical": 0.6,
    "firm": 0.7,
    "challenging": 0.7,
    "concerned": 0.5,
    "excited": 0.7,
    "closing": 0.4,
}


def is_valid_wav(data: bytes) -> bool:
    """Validate that binary payload contains a valid RIFF/WAVE header and data."""
    if not data or len(data) < 44:
        return False
    if not data.startswith(b"RIFF"):
        return False
    if data[8:12] != b"WAVE":
        return False
    if b"fmt " not in data[:36]:
        return False
    return True


class ChatterboxProvider(BaseTTSProvider):
    """Voice provider adapter routing speech synthesis to Chatterbox Turbo GPU microservice."""

    def __init__(self):
        self._fallback = CurrentTTSProvider()

    def _map_parameters(
        self,
        text: str,
        emotion: str,
        delivery: Optional[Dict[str, Any]],
    ) -> Tuple[str, float, bool]:
        """Map Coach emotion and delivery metadata to Chatterbox Turbo parameters."""
        emotion_clean = (emotion or "neutral").strip().lower()
        default_intensity = EMOTION_INTENSITY_MAP.get(emotion_clean, 0.5)

        intensity = default_intensity
        paralinguistics = False

        if delivery and isinstance(delivery, dict):
            if "intensity" in delivery and isinstance(delivery["intensity"], (int, float)):
                intensity = max(0.0, min(1.0, float(delivery["intensity"])))
            if delivery.get("paralinguistics"):
                paralinguistics = True

        # Check for inline paralinguistic tags in prompt text
        if re.search(r"\[(chuckle|sigh|gasp|cough|laugh|groan|happy|whispering)\]", text, re.IGNORECASE):
            paralinguistics = True

        return emotion_clean, intensity, paralinguistics

    def synthesize(
        self,
        text: str,
        emotion: str = "neutral",
        delivery: Optional[Dict[str, Any]] = None,
        voice_id: Optional[str] = None,
    ) -> TTSResult:
        """Synthesize text into speech audio via Chatterbox Turbo GPU microservice.
        
        If disabled, unconfigured, timed out, or encountering an error, automatically
        falls back to CurrentTTSProvider (MiniMax -> OpenAI -> gTTS).
        """
        clean_text = text.strip()[:1200]
        if not clean_text:
            return TTSResult(available=False, reason="Text is empty", provider_name="chatterbox")

        settings = get_settings()

        # 1. Feature Flag Check
        if not settings.chatterbox_enabled:
            logger.debug("[ChatterboxProvider] Feature flag disabled; delegating to CurrentTTSProvider.")
            result = self._fallback.synthesize(text, emotion=emotion, delivery=delivery, voice_id=voice_id)
            result.provider_name = "chatterbox_fallback"
            result.metadata["chatterbox_fallback"] = True
            result.metadata["chatterbox_fallback_reason"] = "disabled"
            return result

        # 2. Configuration Validation (URL & Secret Token)
        gpu_url = (settings.chatterbox_url or "").strip()
        gpu_token = (settings.chatterbox_token or "").strip()

        if not gpu_url or not gpu_token:
            logger.warning("[ChatterboxProvider] Missing SPARK_CHATTERBOX_URL or SPARK_CHATTERBOX_TOKEN; falling back.")
            result = self._fallback.synthesize(text, emotion=emotion, delivery=delivery, voice_id=voice_id)
            result.provider_name = "chatterbox_fallback"
            result.metadata["chatterbox_fallback"] = True
            result.metadata["chatterbox_fallback_reason"] = "missing_configuration"
            return result

        # 3. Language Check (Turbo only supports English; route non-English to fallback)
        lang = "en"
        if delivery and isinstance(delivery, dict):
            lang = delivery.get("language", "en")
        if str(lang).lower() not in ("en", "en-us", "en-gb") or re.search(r"[\u0900-\u097F]", clean_text):
            logger.info(f"[ChatterboxProvider] Language '{lang}' not supported by Turbo; routing to fallback.")
            result = self._fallback.synthesize(text, emotion=emotion, delivery=delivery, voice_id=voice_id)
            result.provider_name = "chatterbox_fallback"
            result.metadata["chatterbox_fallback"] = True
            result.metadata["chatterbox_fallback_reason"] = "unsupported_language"
            return result

        # 4. Map Emotion & Delivery
        emotion_tag, intensity, has_paralinguistics = self._map_parameters(clean_text, emotion, delivery)
        req_id = (delivery.get("request_id") if delivery and isinstance(delivery, dict) else None) or str(uuid.uuid4())

        payload = {
            "text": clean_text,
            "voice": voice_id or "default",
            "emotion": emotion_tag,
            "intensity": intensity,
            "language": "en",
            "paralinguistics": has_paralinguistics,
            "request_id": req_id,
        }

        # 5. Remote Server-to-Server Invocation with Bounded Timeout
        endpoint = f"{gpu_url.rstrip('/')}/v1/tts"
        headers = {
            "Authorization": f"Bearer {gpu_token}",
            "Content-Type": "application/json",
        }
        timeout_s = getattr(settings, "chatterbox_timeout_seconds", 6.0) or 6.0

        t0 = time.perf_counter()
        try:
            resp = httpx.post(endpoint, json=payload, headers=headers, timeout=timeout_s)
            elapsed_ms = (time.perf_counter() - t0) * 1000

            # 6. Response Status Validation
            if resp.status_code == 200:
                audio_bytes = resp.content
                content_type = resp.headers.get("content-type", "").lower()

                # Validate audio payload and WAV format
                if "audio/wav" in content_type and is_valid_wav(audio_bytes):
                    meta = {
                        "provider": "chatterbox",
                        "engine": "chatterbox-turbo",
                        "roundtrip_ms": round(elapsed_ms, 1),
                        "request_id": resp.headers.get("x-request-id", req_id),
                        "audio_duration_s": resp.headers.get("x-audio-duration-seconds"),
                        "remote_inference_ms": resp.headers.get("x-inference-time-ms"),
                        "rtf": resp.headers.get("x-real-time-factor"),
                        "peak_vram_mb": resp.headers.get("x-peak-vram-mb"),
                    }
                    logger.info(
                        f"[ChatterboxProvider] Success | req_id={req_id} | rtt={elapsed_ms:.1f}ms | bytes={len(audio_bytes)}"
                    )
                    return TTSResult(
                        audio_bytes=audio_bytes,
                        media_type="audio/wav",
                        provider_name="chatterbox",
                        available=True,
                        metadata=meta,
                    )
                else:
                    logger.warning(
                        f"[ChatterboxProvider] Malformed audio response: content_type={content_type}, bytes={len(audio_bytes)}"
                    )
                    fallback_reason = "malformed_audio"

            else:
                logger.warning(
                    f"[ChatterboxProvider] Remote GPU service returned HTTP {resp.status_code}; falling back."
                )
                fallback_reason = f"http_error_{resp.status_code}"

        except httpx.TimeoutException:
            elapsed_ms = (time.perf_counter() - t0) * 1000
            logger.warning(
                f"[ChatterboxProvider] Request timed out after {elapsed_ms:.1f}ms (budget: {timeout_s}s); falling back."
            )
            fallback_reason = "timeout"

        except Exception as e:
            elapsed_ms = (time.perf_counter() - t0) * 1000
            logger.warning(
                f"[ChatterboxProvider] Remote invocation exception ({type(e).__name__}); falling back."
            )
            fallback_reason = f"exception_{type(e).__name__}"

        # 7. Safe Automatic Fallback Execution
        result = self._fallback.synthesize(text, emotion=emotion, delivery=delivery, voice_id=voice_id)
        result.provider_name = "chatterbox_fallback"
        result.metadata["chatterbox_fallback"] = True
        result.metadata["chatterbox_fallback_reason"] = fallback_reason
        return result
