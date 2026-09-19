"""Central configuration. Everything is env-driven so the app runs with zero
external keys in 'mock' mode, and switches to real providers when keys exist."""
import os
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv(Path(__file__).resolve().parent.parent / ".env")  # populate os.environ from .env


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Spark"
    database_url: str = "sqlite:///./spark.db"



    # --- Channel adapter ----------------------------------------------------
    # The MVP channel. "telegram" is recommended (free, instant). "whatsapp"
    # needs a BSP + Meta approval + per-message budget; "mock" for local dev.
    channel: str = "mock"
    telegram_bot_token: str = ""
    whatsapp_token: str = ""
    whatsapp_phone_id: str = ""
    whatsapp_verify_token: str = "spark-verify"

    # --- Transcription & TTS (Voice) ---------------------------------------
    # "mock" | "bhashini" | "whisper"
    transcriber: str = "mock"
    bhashini_api_key: str = ""
    tts_provider: str = "current"  # "current" | "chatterbox" | "kokoro"
    minimax_api_key: str = ""
    minimax_tts_model: str = "speech-2.8-turbo"
    chatterbox_enabled: bool = False
    chatterbox_url: str = ""
    chatterbox_token: str = ""
    chatterbox_timeout_seconds: float = 6.0

    # --- Billing ------------------------------------------------------------
    # NEVER hardcode real or test credentials here. Use .env only.
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_mode: str = "test"   # "test" or "live"

    # --- Career (Adzuna live demand) ----------------------------------------
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""

    # --- LLM adapter --------------------------------------------------------
    # provider: "mock" (no key needed) | "openrouter" | "xai" | "grok" | "gemini" | "groq" | "anthropic"
    llm_provider: str = "mock"
    openrouter_api_key: str = ""
    openrouter_model: str = ""
    xai_api_key: str = ""
    grok_api_key: str = ""
    gemini_api_key: str = ""
    groq_api_key: str = ""
    anthropic_api_key: str = ""
    llm_model: str = ""  # optional override

    # --- Plan limits --------------------------------------------------------
    free_card_limit: int = 30           # lifetime cards on free tier


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    env_tts = os.environ.get("SPARK_TTS_PROVIDER") or os.environ.get("TTS_PROVIDER")
    if env_tts:
        s.tts_provider = env_tts.strip().lower()
    env_cb_enabled = os.environ.get("SPARK_CHATTERBOX_ENABLED") or os.environ.get("CHATTERBOX_ENABLED")
    if env_cb_enabled is not None:
        s.chatterbox_enabled = env_cb_enabled.strip().lower() in ("true", "1", "yes")
    env_cb_url = os.environ.get("SPARK_CHATTERBOX_URL") or os.environ.get("CHATTERBOX_URL")
    if env_cb_url:
        s.chatterbox_url = env_cb_url.strip()
    env_cb_token = os.environ.get("SPARK_CHATTERBOX_TOKEN") or os.environ.get("CHATTERBOX_TOKEN") or os.environ.get("CHATTERBOX_SERVICE_KEY")
    if env_cb_token:
        s.chatterbox_token = env_cb_token.strip()

    env_cb_timeout = os.environ.get("SPARK_CHATTERBOX_TIMEOUT_SECONDS") or os.environ.get("CHATTERBOX_TIMEOUT_SECONDS")
    if env_cb_timeout:
        try:
            s.chatterbox_timeout_seconds = float(env_cb_timeout.strip())
        except ValueError:
            pass
    if s.llm_provider == "mock":
        if s.openrouter_api_key:
            s.llm_provider = "openrouter"
        elif s.xai_api_key or s.grok_api_key:
            s.llm_provider = "xai"
        elif s.gemini_api_key:
            s.llm_provider = "gemini"
        elif s.groq_api_key:
            s.llm_provider = "groq"
        elif s.anthropic_api_key:
            s.llm_provider = "anthropic"
    return s
