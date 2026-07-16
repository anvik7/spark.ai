"""Regional-language voice transcription. WhatsApp/Telegram hand you an audio
file server-side (the phone already uploaded it), so transcription is a backend
job — not on-device. Bhashini for Indian languages; Whisper as a fallback."""
import httpx
from .config import get_settings

settings = get_settings()


def transcribe(audio_bytes: bytes, lang_hint: str = "auto") -> str:
    t = settings.transcriber
    try:
        if t == "bhashini" and settings.bhashini_api_key:
            return _bhashini(audio_bytes, lang_hint)
        if t == "whisper":
            return _whisper(audio_bytes)
    except Exception as e:
        print(f"[transcribe] '{t}' failed, using mock: {e}")
    # Mock: lets the whole pipeline run offline.
    return f"[voice note transcript placeholder, {len(audio_bytes)} bytes]"


def _bhashini(audio_bytes: bytes, lang_hint: str) -> str:
    # Bhashini's ASR+translation pipeline is a two-call flow (config -> compute).
    # Wire your pipeline_id and the /v1/inference endpoint here.
    raise NotImplementedError("Add Bhashini pipeline_id + inference call")


def _whisper(audio_bytes: bytes) -> str:
    raise NotImplementedError("Point at a Whisper endpoint / faster-whisper")
