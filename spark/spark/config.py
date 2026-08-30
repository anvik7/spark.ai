"""Central configuration. Everything is env-driven so the app runs with zero
external keys in 'mock' mode, and switches to real providers when keys exist."""
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv(Path(__file__).resolve().parent.parent / ".env")  # populate os.environ from .env


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Spark"
    database_url: str = "sqlite:///./spark.db"

    # --- LLM adapter --------------------------------------------------------
    # provider: "mock" (no key needed) | "xai" | "grok" | "gemini" | "groq" | "anthropic"
    llm_provider: str = "mock"
    xai_api_key: str = ""
    grok_api_key: str = ""
    gemini_api_key: str = ""
    groq_api_key: str = ""
    anthropic_api_key: str = ""
    llm_model: str = ""  # optional override

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
    minimax_api_key: str = ""
    minimax_tts_model: str = "speech-2.8-turbo"

    # --- Billing ------------------------------------------------------------
    razorpay_key_id: str = "rzp_test_TEBukEgSDIHGN9"
    razorpay_key_secret: str = "TBoVVUv4WroLUKDindEqkoSE"
    razorpay_webhook_secret: str = ""

    # --- Career (Adzuna live demand) ----------------------------------------
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""

    # --- Plan limits --------------------------------------------------------
    free_card_limit: int = 30           # lifetime cards on free tier
    free_ai_calls_per_day: int = 20     # rate-limit AI endpoints on free tier
    pro_price_inr: int = 299            # monthly, in rupees
    ultra_price_inr: int = 599          # monthly, in rupees


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.llm_provider == "mock":
        if s.xai_api_key or s.grok_api_key:
            s.llm_provider = "xai"
        elif s.gemini_api_key:
            s.llm_provider = "gemini"
        elif s.groq_api_key:
            s.llm_provider = "groq"
        elif s.anthropic_api_key:
            s.llm_provider = "anthropic"
    return s
