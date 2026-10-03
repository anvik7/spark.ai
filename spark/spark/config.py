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

    # --- Object Storage (Local / S3 / Cloudflare R2) ------------------------
    storage_backend: str = "local"  # "local" | "s3"
    storage_local_dir: str = ""     # optional override for local storage directory
    s3_endpoint_url: str = ""       # For Cloudflare R2: https://<account_id>.r2.cloudflarestorage.com
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket: str = ""
    s3_region: str = "auto"         # "auto" for Cloudflare R2, or e.g. "us-east-1"


    # --- Email & Password Recovery ------------------------------------------
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@sparkdhi.ai"
    app_base_url: str = "https://sparkdhi.ai"

    # --- Founder Access -----------------------------------------------------
    founder_emails: str = ""

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
    if not s.founder_emails:
        s.founder_emails = os.environ.get("SPARK_FOUNDER_EMAILS") or os.environ.get("FOUNDER_EMAILS") or ""
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

    # Storage backend resolution
    env_backend = os.environ.get("STORAGE_BACKEND") or os.environ.get("SPARK_STORAGE_BACKEND")
    if env_backend:
        s.storage_backend = env_backend.strip().lower()
    env_s3_endpoint = (
        os.environ.get("S3_ENDPOINT_URL")
        or os.environ.get("R2_ENDPOINT_URL")
        or os.environ.get("CLOUDFLARE_R2_ENDPOINT")
        or os.environ.get("SPARK_S3_ENDPOINT_URL")
    )
    if env_s3_endpoint:
        s.s3_endpoint_url = env_s3_endpoint.strip()
    env_s3_key = (
        os.environ.get("S3_ACCESS_KEY_ID")
        or os.environ.get("AWS_ACCESS_KEY_ID")
        or os.environ.get("R2_ACCESS_KEY_ID")
        or os.environ.get("SPARK_S3_ACCESS_KEY_ID")
    )
    if env_s3_key:
        s.s3_access_key_id = env_s3_key.strip()
    env_s3_secret = (
        os.environ.get("S3_SECRET_ACCESS_KEY")
        or os.environ.get("AWS_SECRET_ACCESS_KEY")
        or os.environ.get("R2_SECRET_ACCESS_KEY")
        or os.environ.get("SPARK_S3_SECRET_ACCESS_KEY")
    )
    if env_s3_secret:
        s.s3_secret_access_key = env_s3_secret.strip()
    env_s3_bucket = (
        os.environ.get("S3_BUCKET")
        or os.environ.get("AWS_S3_BUCKET")
        or os.environ.get("R2_BUCKET")
        or os.environ.get("S3_BUCKET_NAME")
        or os.environ.get("SPARK_S3_BUCKET")
    )
    if env_s3_bucket:
        s.s3_bucket = env_s3_bucket.strip()
    env_s3_region = (
        os.environ.get("S3_REGION")
        or os.environ.get("AWS_REGION")
        or os.environ.get("R2_REGION")
        or os.environ.get("SPARK_S3_REGION")
    )
    if env_s3_region:
        s.s3_region = env_s3_region.strip()
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
