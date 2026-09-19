"""Base interfaces and data structures for TTS Voice Providers."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Dict, Any


@dataclass
class TTSResult:
    """Standardized response from any TTS provider."""
    audio_bytes: bytes = b""
    media_type: str = "audio/mpeg"
    provider_name: str = "current"
    available: bool = True
    reason: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


class BaseTTSProvider(ABC):
    """Abstract base class for SparkDhi voice providers."""

    @abstractmethod
    def synthesize(
        self,
        text: str,
        emotion: str = "neutral",
        delivery: Optional[Dict[str, Any]] = None,
        voice_id: Optional[str] = None,
    ) -> TTSResult:
        """Synthesize text into speech audio with optional emotion and delivery parameters.
        
        Args:
            text: Normalized text to speak.
            emotion: Delivery state (warm, curious, encouraging, impressed, skeptical, firm, challenging, etc.)
            delivery: Detailed delivery metadata (pace, energy, pauses)
            voice_id: Specific voice identifier if supported
            
        Returns:
            TTSResult containing binary audio or availability error status.
        """
        raise NotImplementedError
