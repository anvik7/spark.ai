"""TTS Provider Factory resolving providers dynamically based on configuration."""
import logging
from functools import lru_cache

from ..config import get_settings
from .base import BaseTTSProvider
from .current import CurrentTTSProvider
from .chatterbox import ChatterboxProvider
from .placeholders import KokoroProvider

logger = logging.getLogger("spark.tts")


@lru_cache(maxsize=4)
def get_tts_provider(provider_override: str = None) -> BaseTTSProvider:
    """Retrieve the active TTS VoiceProvider instance.
    
    Resolves dynamically:
    1. provider_override if explicitly passed.
    2. If SPARK_CHATTERBOX_ENABLED=true and SPARK_CHATTERBOX_URL exists: ChatterboxProvider.
    3. Otherwise: CurrentTTSProvider (or SPARK_TTS_PROVIDER setting).
    Safe fallback: any unconfigured, unrecognized, or invalid value returns CurrentTTSProvider.
    """
    settings = get_settings()
    if provider_override:
        name = provider_override.strip().lower()
    elif getattr(settings, "chatterbox_enabled", False) and getattr(settings, "chatterbox_url", "").strip():
        name = "chatterbox"
    else:
        name = (getattr(settings, "tts_provider", "current") or "current").strip().lower()

    if name == "chatterbox":
        return ChatterboxProvider()
    elif name == "kokoro":
        return KokoroProvider()
    elif name == "current":
        return CurrentTTSProvider()
    else:
        logger.warning(f"[get_tts_provider] Unknown provider '{name}'. Safely falling back to CurrentTTSProvider.")
        return CurrentTTSProvider()

