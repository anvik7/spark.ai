"""Future TTS Provider Placeholders (Chatterbox and Kokoro).

These classes provide seamless forward compatibility for future phases.
In Phase 1, they log a diagnostic note and safely delegate to CurrentTTSProvider
to prevent any breaking runtime failures.
"""
import logging
from typing import Optional, Dict, Any

from .base import BaseTTSProvider, TTSResult
from .current import CurrentTTSProvider

logger = logging.getLogger("spark.tts")


class ChatterboxProvider(BaseTTSProvider):
    """Placeholder for Chatterbox Turbo / Multilingual integration (Phase 2+).
    
    Delegates safely to CurrentTTSProvider in Phase 1.
    """

    def __init__(self):
        self._fallback = CurrentTTSProvider()

    def synthesize(
        self,
        text: str,
        emotion: str = "neutral",
        delivery: Optional[Dict[str, Any]] = None,
        voice_id: Optional[str] = None,
    ) -> TTSResult:
        logger.info("[ChatterboxProvider] Chatterbox not enabled in Phase 1; routing to CurrentTTSProvider fallback.")
        result = self._fallback.synthesize(text, emotion=emotion, delivery=delivery, voice_id=voice_id)
        result.provider_name = "chatterbox_fallback"
        return result


class KokoroProvider(BaseTTSProvider):
    """Placeholder for Kokoro ONNX integration (Phase 2+).
    
    Delegates safely to CurrentTTSProvider in Phase 1.
    """

    def __init__(self):
        self._fallback = CurrentTTSProvider()

    def synthesize(
        self,
        text: str,
        emotion: str = "neutral",
        delivery: Optional[Dict[str, Any]] = None,
        voice_id: Optional[str] = None,
    ) -> TTSResult:
        logger.info("[KokoroProvider] Kokoro not enabled in Phase 1; routing to CurrentTTSProvider fallback.")
        result = self._fallback.synthesize(text, emotion=emotion, delivery=delivery, voice_id=voice_id)
        result.provider_name = "kokoro_fallback"
        return result
