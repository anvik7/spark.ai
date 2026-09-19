"""SparkDhi TTS Voice Provider Abstraction Package."""
from .base import BaseTTSProvider, TTSResult
from .current import CurrentTTSProvider
from .chatterbox import ChatterboxProvider
from .placeholders import KokoroProvider
from .factory import get_tts_provider

__all__ = [
    "BaseTTSProvider",
    "TTSResult",
    "CurrentTTSProvider",
    "ChatterboxProvider",
    "KokoroProvider",
    "get_tts_provider",
]
