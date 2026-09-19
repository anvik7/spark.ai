"""Current Production TTS Provider implementing MiniMax, OpenAI, and gTTS waterfall."""
import io
import importlib
import logging
from typing import Optional, Dict, Any
import httpx

from ..config import get_settings
from .base import BaseTTSProvider, TTSResult

logger = logging.getLogger("spark.tts")


class CurrentTTSProvider(BaseTTSProvider):
    """The existing production TTS provider wrapping MiniMax, OpenAI, and gTTS."""

    def synthesize(
        self,
        text: str,
        emotion: str = "neutral",
        delivery: Optional[Dict[str, Any]] = None,
        voice_id: Optional[str] = None,
    ) -> TTSResult:
        s = get_settings()
        clean_text = text.strip()[:2000]
        if not clean_text:
            return TTSResult(available=False, reason="Text is empty", provider_name="current")

        metadata = {"emotion": emotion, "delivery": delivery or {}}

        # 1. MiniMax Speech
        if s.minimax_api_key:
            try:
                mm_voice = voice_id or "Friendly_Person"
                r = httpx.post(
                    "https://api.minimax.io/v1/t2a_v2",
                    headers={"Authorization": f"Bearer {s.minimax_api_key}", "Content-Type": "application/json"},
                    json={
                        "model": s.minimax_tts_model or "speech-2.8-turbo",
                        "text": clean_text,
                        "voice_setting": {"voice_id": mm_voice},
                    },
                    timeout=15,
                )
                if r.status_code == 200:
                    data = r.json()
                    hex_audio = data.get("data", {}).get("audio", {}).get("audio_file") or data.get("audio_file")
                    if hex_audio:
                        metadata["engine"] = "minimax"
                        return TTSResult(
                            audio_bytes=bytes.fromhex(hex_audio),
                            media_type="audio/mpeg",
                            provider_name="current",
                            available=True,
                            metadata=metadata,
                        )
            except Exception as e:
                logger.warning(f"[CurrentTTSProvider] MiniMax error: {e}")

        # 2. OpenAI TTS
        openai_key = getattr(s, "openai_api_key", None) or getattr(s, "openai_key", None)
        if openai_key:
            try:
                oai_voice = voice_id or "alloy"
                r = httpx.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={"Authorization": f"Bearer {openai_key}", "Content-Type": "application/json"},
                    json={"model": "tts-1", "input": clean_text, "voice": oai_voice},
                    timeout=15,
                )
                if r.status_code == 200:
                    metadata["engine"] = "openai"
                    return TTSResult(
                        audio_bytes=r.content,
                        media_type="audio/mpeg",
                        provider_name="current",
                        available=True,
                        metadata=metadata,
                    )
            except Exception as e:
                logger.warning(f"[CurrentTTSProvider] OpenAI error: {e}")

        # 3. Reliable gTTS (Google Text-to-Speech) Fallback (0 API keys required)
        try:
            gtts_mod = importlib.import_module("gtts")
            gTTS = getattr(gtts_mod, "gTTS")

            tts_obj = gTTS(text=clean_text, lang="en", tld="com")
            buf = io.BytesIO()
            tts_obj.write_to_fp(buf)
            metadata["engine"] = "gtts"
            return TTSResult(
                audio_bytes=buf.getvalue(),
                media_type="audio/mpeg",
                provider_name="current",
                available=True,
                metadata=metadata,
            )
        except Exception as e:
            logger.error(f"[CurrentTTSProvider] gTTS error: {e}")
            return TTSResult(
                available=False,
                reason=f"TTS synthesis failed: {type(e).__name__}",
                provider_name="current",
                metadata=metadata,
            )
