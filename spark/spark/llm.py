"""LLM adapter and resilient multi-provider router.
Provides a unified abstraction over OpenRouter, Groq, and Gemini (plus xAI, Anthropic, and offline Mock)
with bounded timeouts, automatic provider fallback, Pydantic schema validation for structured outputs,
and safe log/error sanitization.
"""
import json
import re
import time
from typing import Any, Optional
import httpx
from pydantic import BaseModel, Field, ValidationError

from .config import get_settings

settings = get_settings()

# --- Global Deadlines & Timeouts --------------------------------------------
DEFAULT_GLOBAL_DEADLINE = 35.0          # Max total seconds across all provider attempts
DEFAULT_PER_ATTEMPT_TIMEOUT = 18.0      # Max seconds for a single provider attempt
MIN_REMAINING_FOR_ATTEMPT = 2.0         # Minimum seconds remaining to justify starting a new network attempt

# --- Exceptions -------------------------------------------------------------

class LLMError(Exception):
    """Base exception for LLM operations."""
    pass

class LLMAuthError(LLMError):
    """Authentication or authorization failure (HTTP 401/403). Non-retryable for this provider."""
    pass

class LLMRateLimitError(LLMError):
    """Rate limit exceeded (HTTP 429). Retryable via fallback."""
    pass

class LLMTimeoutError(LLMError):
    """Provider network or execution timeout."""
    pass

class LLMProviderError(LLMError):
    """Upstream provider error (HTTP 5xx, gateway error, network drop)."""
    pass

class LLMInvalidOutputError(LLMError):
    """Provider response was empty, invalid JSON, or failed schema validation."""
    pass

class AIServiceUnavailableError(RuntimeError):
    """Raised when all configured AI providers fail or are unavailable.
    Subclasses RuntimeError for full backwards compatibility with existing callers.
    """
    pass

# --- Structured Output Schemas (Pydantic v2) --------------------------------

class TaskSolutionSchema(BaseModel):
    subject: str = "General Academic"
    icon: str = "📚"
    title: str
    solution: str
    steps: list[str]
    formulas: list[str] = Field(default_factory=list)
    intuition: str = ""
    practice: list[str] = Field(default_factory=list)

class StudyQuizItemSchema(BaseModel):
    question_type: str = "mcq"
    question_text: str
    options: list[str] = Field(default_factory=list)
    correct_answer: str = ""
    explanation: str = ""
    concept_tag: str = ""

class StudyChapterSchema(BaseModel):
    title: str
    start_time: int = 0
    end_time: int = 0
    duration_seconds: int = 0
    transcript_segment: str = ""
    short_explanation: str = ""
    key_concepts: list[str] = Field(default_factory=list)
    learning_objective: str = ""
    difficulty: str = "Beginner"
    recall_prompt: str = ""
    quiz: list[StudyQuizItemSchema] = Field(default_factory=list)

class StudyMindmapNodeSchema(BaseModel):
    node_key: str
    label: str
    parent_key: Optional[str] = None
    concept_tag: str = ""
    depth: int = 0

class StudyChaptersSchema(BaseModel):
    subject: str = "General Academic"
    chapters: list[StudyChapterSchema]
    mindmap_nodes: list[StudyMindmapNodeSchema] = Field(default_factory=list)

class ActiveRecallSchema(BaseModel):
    understanding_score: int
    understood_concepts: list[str] = Field(default_factory=list)
    missing_concepts: list[str] = Field(default_factory=list)
    misconceptions: list[str] = Field(default_factory=list)
    recommendation: str = ""

# --- Safe Logging & JSON Extraction -----------------------------------------

def _sanitize_log(msg: str) -> str:
    """Sanitize message to ensure no API keys, Bearer tokens, or secrets are leaked."""
    patterns = [
        r"sk-[a-zA-Z0-9_\-]{8,}",
        r"gsk_[a-zA-Z0-9_\-]{8,}",
        r"AIza[a-zA-Z0-9_\-]{20,}",
        r"Bearer\s+[^\s'\"]+",
    ]
    sanitized = str(msg)
    for p in patterns:
        sanitized = re.sub(p, "[REDACTED]", sanitized)
    return sanitized

def _log_attempt(provider: str, attempt: int, status_code: str, latency_ms: float, error_category: Optional[str] = None) -> None:
    """Log minimal diagnostic info without exposing prompt content, headers, or tokens."""
    cat_part = f" category={error_category}" if error_category else ""
    print(f"[llm_router] provider={provider} attempt={attempt} status={status_code} latency={latency_ms:.1f}ms{cat_part}")

def _clean_json_text(raw: str) -> str:
    """Strip markdown fences (```json ... ```) and leading/trailing whitespace."""
    s = raw.strip()
    if s.startswith("```"):
        nl = s.find("\n")
        if nl != -1:
            s = s[nl + 1:]
        if s.endswith("```"):
            s = s[:-3]
        s = s.strip()
    return s

def _extract_and_validate_json(raw: str, schema: Optional[type[BaseModel]] = None) -> dict:
    """Extract JSON object from string and validate against Pydantic schema if provided."""
    cleaned = _clean_json_text(raw)
    parsed = None

    # Try direct parsing first
    try:
        parsed = json.loads(cleaned)
    except Exception:
        # Search for first outermost JSON object
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except Exception as e:
                raise LLMInvalidOutputError(f"Malformed JSON in response: {_sanitize_log(str(e))}")
        else:
            raise LLMInvalidOutputError("No JSON object found in response.")

    if not isinstance(parsed, dict):
        raise LLMInvalidOutputError(f"Expected JSON object, got {type(parsed).__name__}")

    if schema is not None:
        try:
            validated = schema.model_validate(parsed)
            return validated.model_dump()
        except ValidationError as ve:
            raise LLMInvalidOutputError(f"Schema validation failed: {_sanitize_log(str(ve))}")

    return parsed

def _extract_json(s: str) -> dict:
    """Backward-compatible JSON extractor: returns dict or empty dict on failure."""
    try:
        return _extract_and_validate_json(s)
    except Exception:
        m = re.search(r"\{.*\}", s, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return {}
        return {}

def _extract_json_array(text: str):
    """Backward-compatible JSON array extractor."""
    s, e = text.find("["), text.rfind("]")
    if s == -1 or e == -1 or e < s:
        return None
    try:
        return json.loads(text[s:e + 1])
    except Exception:
        return None

# --- Provider Adapters ------------------------------------------------------

class BaseLLMProvider:
    """Internal provider adapter interface."""
    name: str = "base"
    supports_vision: bool = False

    def is_configured(self) -> bool:
        raise NotImplementedError

    def complete_text(self, prompt: str, timeout: float) -> str:
        raise NotImplementedError

    def complete_vision(self, prompt: str, image_b64: str, mime_type: str = "image/jpeg", timeout: float = 30.0) -> str:
        raise NotImplementedError("Vision not supported by this provider.")


class OpenRouterAdapter(BaseLLMProvider):
    name = "openrouter"
    supports_vision = True

    def is_configured(self) -> bool:
        s = get_settings()
        return bool(s.openrouter_api_key)

    def _get_headers(self) -> dict:
        s = get_settings()
        return {
            "Authorization": f"Bearer {s.openrouter_api_key}",
            "HTTP-Referer": "https://sparkdhi.ai",
            "X-Title": "SparkDhi Student Workspace",
            "Content-Type": "application/json",
        }

    def complete_text(self, prompt: str, timeout: float) -> str:
        s = get_settings()
        if not s.openrouter_api_key:
            raise LLMAuthError("OpenRouter API key is not configured.")
        model = s.openrouter_model or s.llm_model or "meta-llama/llama-3.3-70b-instruct"
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
        }
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post("https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload)
        except httpx.TimeoutException as te:
            raise LLMTimeoutError(f"OpenRouter timed out after {timeout:.1f}s") from te
        except httpx.RequestError as re_err:
            raise LLMProviderError(f"OpenRouter network error: {_sanitize_log(str(re_err))}") from re_err

        if r.status_code in (401, 403):
            raise LLMAuthError("OpenRouter authentication failed (HTTP 401/403).")
        if r.status_code == 429:
            raise LLMRateLimitError("OpenRouter rate limit exceeded (HTTP 429).")
        if r.status_code >= 500:
            raise LLMProviderError(f"OpenRouter server error (HTTP {r.status_code}).")
        if r.status_code >= 400:
            raise LLMProviderError(f"OpenRouter returned HTTP {r.status_code}.")

        try:
            data = r.json()
        except Exception as e:
            raise LLMInvalidOutputError(f"OpenRouter returned non-JSON response: {_sanitize_log(str(e))}")

        choices = data.get("choices")
        if not choices or not isinstance(choices, list) or len(choices) == 0:
            raise LLMInvalidOutputError("OpenRouter returned empty choices.")
        content = choices[0].get("message", {}).get("content")
        if content is None or not str(content).strip():
            raise LLMInvalidOutputError("OpenRouter returned empty content.")
        return str(content).strip()

    def complete_vision(self, prompt: str, image_b64: str, mime_type: str = "image/jpeg", timeout: float = 30.0) -> str:
        s = get_settings()
        if not s.openrouter_api_key:
            raise LLMAuthError("OpenRouter API key is not configured.")
        base_model = s.openrouter_model or s.llm_model or "google/gemini-2.0-flash-001"
        model = "google/gemini-2.0-flash-001" if "llama-3.3-70b-instruct" in base_model else base_model
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
                    ],
                }
            ],
        }
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post("https://openrouter.ai/api/v1/chat/completions", headers=self._get_headers(), json=payload)
        except httpx.TimeoutException as te:
            raise LLMTimeoutError(f"OpenRouter vision timed out after {timeout:.1f}s") from te
        except httpx.RequestError as re_err:
            raise LLMProviderError(f"OpenRouter vision network error: {_sanitize_log(str(re_err))}") from re_err

        if r.status_code in (401, 403):
            raise LLMAuthError("OpenRouter authentication failed (HTTP 401/403).")
        if r.status_code == 429:
            raise LLMRateLimitError("OpenRouter rate limit exceeded (HTTP 429).")
        if r.status_code >= 500:
            raise LLMProviderError(f"OpenRouter server error (HTTP {r.status_code}).")
        if r.status_code >= 400:
            raise LLMProviderError(f"OpenRouter vision returned HTTP {r.status_code}.")

        try:
            data = r.json()
        except Exception as e:
            raise LLMInvalidOutputError(f"OpenRouter vision returned non-JSON response: {_sanitize_log(str(e))}")

        choices = data.get("choices")
        if not choices or not isinstance(choices, list) or len(choices) == 0:
            raise LLMInvalidOutputError("OpenRouter vision returned empty choices.")
        content = choices[0].get("message", {}).get("content")
        if content is None or not str(content).strip():
            raise LLMInvalidOutputError("OpenRouter vision returned empty content.")
        return str(content).strip()


class GroqAdapter(BaseLLMProvider):
    name = "groq"
    supports_vision = False

    def is_configured(self) -> bool:
        s = get_settings()
        return bool(s.groq_api_key)

    def complete_text(self, prompt: str, timeout: float) -> str:
        s = get_settings()
        if not s.groq_api_key:
            raise LLMAuthError("Groq API key is not configured.")
        model = s.llm_model or "llama-3.3-70b-versatile"
        headers = {
            "Authorization": f"Bearer {s.groq_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
        }
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        except httpx.TimeoutException as te:
            raise LLMTimeoutError(f"Groq timed out after {timeout:.1f}s") from te
        except httpx.RequestError as re_err:
            raise LLMProviderError(f"Groq network error: {_sanitize_log(str(re_err))}") from re_err

        if r.status_code in (401, 403):
            raise LLMAuthError("Groq authentication failed (HTTP 401/403).")
        if r.status_code == 429:
            raise LLMRateLimitError("Groq rate limit exceeded (HTTP 429).")
        if r.status_code >= 500:
            raise LLMProviderError(f"Groq server error (HTTP {r.status_code}).")
        if r.status_code >= 400:
            raise LLMProviderError(f"Groq returned HTTP {r.status_code}.")

        try:
            data = r.json()
        except Exception as e:
            raise LLMInvalidOutputError(f"Groq returned non-JSON response: {_sanitize_log(str(e))}")

        choices = data.get("choices")
        if not choices or not isinstance(choices, list) or len(choices) == 0:
            raise LLMInvalidOutputError("Groq returned empty choices.")
        content = choices[0].get("message", {}).get("content")
        if content is None or not str(content).strip():
            raise LLMInvalidOutputError("Groq returned empty content.")
        return str(content).strip()

    def complete_vision(self, prompt: str, image_b64: str, mime_type: str = "image/jpeg", timeout: float = 30.0) -> str:
        raise LLMProviderError("Groq does not support vision processing.")


class GeminiAdapter(BaseLLMProvider):
    name = "gemini"
    supports_vision = True

    def is_configured(self) -> bool:
        s = get_settings()
        return bool(s.gemini_api_key)

    def complete_text(self, prompt: str, timeout: float) -> str:
        s = get_settings()
        if not s.gemini_api_key:
            raise LLMAuthError("Gemini API key is not configured.")
        model = s.llm_model or "gemini-2.0-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={s.gemini_api_key}"
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post(url, json=payload)
        except httpx.TimeoutException as te:
            raise LLMTimeoutError(f"Gemini timed out after {timeout:.1f}s") from te
        except httpx.RequestError as re_err:
            raise LLMProviderError(f"Gemini network error: {_sanitize_log(str(re_err))}") from re_err

        if r.status_code in (400, 401, 403):
            txt = r.text
            if "API_KEY_INVALID" in txt or r.status_code in (401, 403):
                raise LLMAuthError("Gemini authentication failed (API key invalid).")
            raise LLMProviderError(f"Gemini returned HTTP {r.status_code}.")
        if r.status_code == 429:
            raise LLMRateLimitError("Gemini rate limit exceeded (HTTP 429).")
        if r.status_code >= 500:
            raise LLMProviderError(f"Gemini server error (HTTP {r.status_code}).")
        if r.status_code >= 400:
            raise LLMProviderError(f"Gemini returned HTTP {r.status_code}.")

        try:
            data = r.json()
        except Exception as e:
            raise LLMInvalidOutputError(f"Gemini returned non-JSON response: {_sanitize_log(str(e))}")

        candidates = data.get("candidates")
        if not candidates or not isinstance(candidates, list) or len(candidates) == 0:
            raise LLMInvalidOutputError("Gemini returned no candidates.")
        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts or not isinstance(parts, list) or len(parts) == 0 or "text" not in parts[0]:
            raise LLMInvalidOutputError("Gemini candidate has no text part.")
        content = parts[0].get("text")
        if content is None or not str(content).strip():
            raise LLMInvalidOutputError("Gemini returned empty text.")
        return str(content).strip()

    def complete_vision(self, prompt: str, image_b64: str, mime_type: str = "image/jpeg", timeout: float = 30.0) -> str:
        s = get_settings()
        if not s.gemini_api_key:
            raise LLMAuthError("Gemini API key is not configured.")
        model = s.llm_model or "gemini-2.0-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={s.gemini_api_key}"
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime_type, "data": image_b64}},
                ]
            }]
        }
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post(url, json=payload)
        except httpx.TimeoutException as te:
            raise LLMTimeoutError(f"Gemini vision timed out after {timeout:.1f}s") from te
        except httpx.RequestError as re_err:
            raise LLMProviderError(f"Gemini vision network error: {_sanitize_log(str(re_err))}") from re_err

        if r.status_code in (401, 403):
            raise LLMAuthError("Gemini authentication failed.")
        if r.status_code == 429:
            raise LLMRateLimitError("Gemini rate limit exceeded.")
        if r.status_code >= 500:
            raise LLMProviderError(f"Gemini server error (HTTP {r.status_code}).")
        if r.status_code >= 400:
            raise LLMProviderError(f"Gemini returned HTTP {r.status_code}.")

        try:
            data = r.json()
        except Exception as e:
            raise LLMInvalidOutputError(f"Gemini vision non-JSON response: {_sanitize_log(str(e))}")

        candidates = data.get("candidates")
        if not candidates or not isinstance(candidates, list) or len(candidates) == 0:
            raise LLMInvalidOutputError("Gemini vision returned no candidates.")
        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts or not isinstance(parts, list) or len(parts) == 0 or "text" not in parts[0]:
            raise LLMInvalidOutputError("Gemini vision candidate has no text part.")
        content = parts[0].get("text")
        if content is None or not str(content).strip():
            raise LLMInvalidOutputError("Gemini vision returned empty text.")
        return str(content).strip()


class XAIAdapter(BaseLLMProvider):
    name = "xai"
    supports_vision = True

    def is_configured(self) -> bool:
        s = get_settings()
        return bool(s.xai_api_key or s.grok_api_key)

    def complete_text(self, prompt: str, timeout: float) -> str:
        s = get_settings()
        key = s.xai_api_key or s.grok_api_key
        if not key:
            raise LLMAuthError("xAI/Grok API key is not configured.")
        model = s.llm_model or "grok-2-latest"
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        payload = {"model": model, "messages": [{"role": "user", "content": prompt}]}
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post("https://api.x.ai/v1/chat/completions", headers=headers, json=payload)
        except httpx.TimeoutException as te:
            raise LLMTimeoutError("xAI request timed out") from te
        except httpx.RequestError as re_err:
            raise LLMProviderError(f"xAI network error: {_sanitize_log(str(re_err))}") from re_err

        if r.status_code in (401, 403):
            raise LLMAuthError("xAI authentication failed.")
        if r.status_code == 429:
            raise LLMRateLimitError("xAI rate limit exceeded.")
        if r.status_code >= 500:
            raise LLMProviderError(f"xAI server error (HTTP {r.status_code}).")
        if r.status_code >= 400:
            raise LLMProviderError(f"xAI returned HTTP {r.status_code}.")

        data = r.json()
        choices = data.get("choices", [])
        if not choices:
            raise LLMInvalidOutputError("xAI returned empty choices.")
        return str(choices[0].get("message", {}).get("content", "")).strip()

    def complete_vision(self, prompt: str, image_b64: str, mime_type: str = "image/jpeg", timeout: float = 30.0) -> str:
        s = get_settings()
        key = s.xai_api_key or s.grok_api_key
        if not key:
            raise LLMAuthError("xAI API key is not configured.")
        model = "grok-2-vision-1212"
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        payload = {
            "model": model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}},
                ],
            }],
        }
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post("https://api.x.ai/v1/chat/completions", headers=headers, json=payload)
        except httpx.TimeoutException as te:
            raise LLMTimeoutError("xAI vision timed out") from te
        except httpx.RequestError as re_err:
            raise LLMProviderError(f"xAI vision network error: {_sanitize_log(str(re_err))}") from re_err

        if r.status_code in (401, 403):
            raise LLMAuthError("xAI authentication failed.")
        if r.status_code == 429:
            raise LLMRateLimitError("xAI rate limit exceeded.")
        if r.status_code >= 500:
            raise LLMProviderError(f"xAI server error (HTTP {r.status_code}).")
        if r.status_code >= 400:
            raise LLMProviderError(f"xAI vision returned HTTP {r.status_code}.")

        data = r.json()
        choices = data.get("choices", [])
        if not choices:
            raise LLMInvalidOutputError("xAI vision returned empty choices.")
        return str(choices[0].get("message", {}).get("content", "")).strip()


class AnthropicAdapter(BaseLLMProvider):
    name = "anthropic"
    supports_vision = True

    def is_configured(self) -> bool:
        s = get_settings()
        return bool(s.anthropic_api_key)

    def complete_text(self, prompt: str, timeout: float) -> str:
        s = get_settings()
        if not s.anthropic_api_key:
            raise LLMAuthError("Anthropic API key is not configured.")
        model = s.llm_model or "claude-haiku-4-5-20251001"
        headers = {"x-api-key": s.anthropic_api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
        payload = {"model": model, "max_tokens": 800, "messages": [{"role": "user", "content": prompt}]}
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
        except httpx.TimeoutException as te:
            raise LLMTimeoutError("Anthropic request timed out") from te
        except httpx.RequestError as re_err:
            raise LLMProviderError(f"Anthropic network error: {_sanitize_log(str(re_err))}") from re_err

        if r.status_code in (401, 403):
            raise LLMAuthError("Anthropic authentication failed.")
        if r.status_code == 429:
            raise LLMRateLimitError("Anthropic rate limit exceeded.")
        if r.status_code >= 500:
            raise LLMProviderError(f"Anthropic server error (HTTP {r.status_code}).")
        if r.status_code >= 400:
            raise LLMProviderError(f"Anthropic returned HTTP {r.status_code}.")

        data = r.json()
        content = data.get("content", [])
        if not content or "text" not in content[0]:
            raise LLMInvalidOutputError("Anthropic returned empty content.")
        return str(content[0]["text"]).strip()

    def complete_vision(self, prompt: str, image_b64: str, mime_type: str = "image/jpeg", timeout: float = 30.0) -> str:
        s = get_settings()
        if not s.anthropic_api_key:
            raise LLMAuthError("Anthropic API key is not configured.")
        model = s.llm_model or "claude-haiku-4-5-20251001"
        headers = {"x-api-key": s.anthropic_api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
        payload = {
            "model": model,
            "max_tokens": 1500,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": image_b64}},
                    {"type": "text", "text": prompt},
                ],
            }],
        }
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
        except httpx.TimeoutException as te:
            raise LLMTimeoutError("Anthropic vision timed out") from te
        except httpx.RequestError as re_err:
            raise LLMProviderError(f"Anthropic vision network error: {_sanitize_log(str(re_err))}") from re_err

        if r.status_code in (401, 403):
            raise LLMAuthError("Anthropic authentication failed.")
        if r.status_code == 429:
            raise LLMRateLimitError("Anthropic rate limit exceeded.")
        if r.status_code >= 500:
            raise LLMProviderError(f"Anthropic server error (HTTP {r.status_code}).")
        if r.status_code >= 400:
            raise LLMProviderError(f"Anthropic vision returned HTTP {r.status_code}.")

        data = r.json()
        content = data.get("content", [])
        if not content or "text" not in content[0]:
            raise LLMInvalidOutputError("Anthropic vision returned empty content.")
        return str(content[0]["text"]).strip()


# --- Model Router -----------------------------------------------------------

class ModelRouter:
    """Manages provider fallback, deadlines, and schema validation."""

    def __init__(self):
        self.providers: dict[str, BaseLLMProvider] = {
            "openrouter": OpenRouterAdapter(),
            "groq": GroqAdapter(),
            "gemini": GeminiAdapter(),
            "xai": XAIAdapter(),
            "anthropic": AnthropicAdapter(),
        }

    def has_configured_real_providers(self) -> bool:
        """Returns True if any real (non-mock) provider is configured and llm_provider is not 'mock'."""
        s = get_settings()
        if s.llm_provider and s.llm_provider.lower() == "mock":
            return False
        return any(p.is_configured() for p in self.providers.values())

    def get_candidate_providers(self, vision: bool = False) -> list[BaseLLMProvider]:
        """Determine ordered candidate providers respecting preferences and configuration."""
        s = get_settings()
        pref = (s.llm_provider or "").lower().strip()

        # Default fallback chain: OpenRouter -> Groq -> Gemini
        default_order = ["openrouter", "groq", "gemini"]

        if pref in ["xai", "grok"]:
            order = ["xai", "openrouter", "groq", "gemini"]
        elif pref == "anthropic":
            order = ["anthropic", "openrouter", "groq", "gemini"]
        elif pref in default_order:
            # Prioritize configured preference at head of chain
            order = [pref] + [p for p in default_order if p != pref]
        else:
            order = default_order

        candidates: list[BaseLLMProvider] = []
        for name in order:
            prov = self.providers.get(name)
            if prov and prov.is_configured():
                if vision and not prov.supports_vision:
                    continue
                candidates.append(prov)
        return candidates

    def generate_text(
        self,
        prompt: str,
        vision: bool = False,
        image_b64: Optional[str] = None,
        mime_type: str = "image/jpeg",
        deadline: float = DEFAULT_GLOBAL_DEADLINE,
        attempt_timeout: float = DEFAULT_PER_ATTEMPT_TIMEOUT,
    ) -> str:
        """Execute text/vision completion across candidate providers with deadline-bounded fallback."""
        candidates = self.get_candidate_providers(vision=vision)
        if not candidates:
            raise AIServiceUnavailableError("No AI providers are configured or available.")

        start_time = time.time()

        for attempt_idx, provider in enumerate(candidates, 1):
            elapsed = time.time() - start_time
            remaining = deadline - elapsed
            if remaining < MIN_REMAINING_FOR_ATTEMPT:
                _log_attempt(provider.name, attempt_idx, "skipped", 0.0, "deadline_exceeded")
                break

            current_timeout = min(attempt_timeout, remaining)
            t0 = time.time()
            try:
                if vision and image_b64:
                    result = provider.complete_vision(prompt, image_b64, mime_type=mime_type, timeout=current_timeout)
                else:
                    result = provider.complete_text(prompt, timeout=current_timeout)

                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "success", duration_ms)
                return result

            except LLMAuthError as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "auth_error", duration_ms, "auth_failure")
                # Permanent auth failure: skip provider immediately without retry
                continue
            except LLMRateLimitError as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "rate_limit", duration_ms, "rate_limited")
                continue
            except LLMTimeoutError as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "timeout", duration_ms, "timeout")
                continue
            except (LLMProviderError, LLMInvalidOutputError) as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "provider_error", duration_ms, "server_error")
                continue
            except Exception as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "unexpected_error", duration_ms, "unknown")
                continue

        raise AIServiceUnavailableError("AI service is temporarily unavailable. Please try again shortly.")

    def generate_structured(
        self,
        prompt: str,
        schema: type[BaseModel],
        vision: bool = False,
        image_b64: Optional[str] = None,
        mime_type: str = "image/jpeg",
        deadline: float = DEFAULT_GLOBAL_DEADLINE,
        attempt_timeout: float = DEFAULT_PER_ATTEMPT_TIMEOUT,
    ) -> dict:
        """Execute structured JSON completion validated against schema with fallback on malformed output."""
        candidates = self.get_candidate_providers(vision=vision)
        if not candidates:
            raise AIServiceUnavailableError("No AI providers are configured or available.")

        start_time = time.time()

        for attempt_idx, provider in enumerate(candidates, 1):
            elapsed = time.time() - start_time
            remaining = deadline - elapsed
            if remaining < MIN_REMAINING_FOR_ATTEMPT:
                _log_attempt(provider.name, attempt_idx, "skipped", 0.0, "deadline_exceeded")
                break

            current_timeout = min(attempt_timeout, remaining)
            t0 = time.time()
            try:
                if vision and image_b64:
                    raw_text = provider.complete_vision(prompt, image_b64, mime_type=mime_type, timeout=current_timeout)
                else:
                    raw_text = provider.complete_text(prompt, timeout=current_timeout)

                # Validate structured output against Pydantic schema
                validated_data = _extract_and_validate_json(raw_text, schema=schema)
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "success", duration_ms)
                return validated_data

            except LLMInvalidOutputError as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "invalid_output", duration_ms, "malformed_output")
                # Trigger fallback to next candidate provider!
                continue
            except LLMAuthError as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "auth_error", duration_ms, "auth_failure")
                continue
            except LLMRateLimitError as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "rate_limit", duration_ms, "rate_limited")
                continue
            except LLMTimeoutError as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "timeout", duration_ms, "timeout")
                continue
            except LLMProviderError as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "provider_error", duration_ms, "server_error")
                continue
            except Exception as e:
                duration_ms = (time.time() - t0) * 1000
                _log_attempt(provider.name, attempt_idx, "unexpected_error", duration_ms, "unknown")
                continue

        raise AIServiceUnavailableError("AI service is temporarily unavailable. Please try again shortly.")


_GLOBAL_ROUTER: Optional[ModelRouter] = None

def get_model_router() -> ModelRouter:
    """Return singleton ModelRouter instance."""
    global _GLOBAL_ROUTER
    if _GLOBAL_ROUTER is None:
        _GLOBAL_ROUTER = ModelRouter()
    return _GLOBAL_ROUTER


# --- Prompts ----------------------------------------------------------------

_PROMPT = (
    "You organise a personal knowledge card. Given a note, return STRICT JSON "
    'with keys "summary" (<=18 words, plain English) and "tags" (3-5 lowercase '
    'kebab-case topic tags, no # symbol). Note:\n\n{text}'
)

_MOCK_TOPICS = {
    "startup": ["startups", "business"], "fund": ["fundraising", "startups"],
    "market": ["marketing", "growth"], "upsc": ["upsc", "polity"],
    "econom": ["economics", "upsc-economics"], "neet": ["neet", "biology"],
    "jee": ["jee", "physics"], "python": ["python", "coding"],
    "supabase": ["supabase", "backend"], "react": ["react", "frontend"],
    "history": ["history"], "tax": ["taxation", "policy"],
    "ai": ["ai", "ml"], "health": ["health"],
}

_SYNTH_PROMPT = (
    "You are a study assistant. The user asked: \"{q}\". Using ONLY their saved "
    "notes below, write a tight structured briefing (<=180 words): a one-line "
    "thesis, then 3-5 bullet insights that connect the notes, surfacing any "
    "contradictions or gaps. Plain English. Notes:\n\n{notes}"
)

_DRAFT_PROMPT = (
    "You are a writing assistant. The user wants you to: \"{instruction}\". "
    "Using ONLY the source notes below as raw material, write the requested piece "
    "directly — no preamble, no explanation, just the finished text, ready to use. "
    "Keep it under 200 words unless the instruction asks for more. Notes:\n\n{notes}"
)

_PLAN_PROMPT = (
    "A developer needs to close these skill gaps for the job market: {skills}. "
    "Return STRICT JSON: an array of objects, one per skill, each with keys "
    '"skill" (exact name), "why" (<=14 words, why it matters), "plan" (<=22 words, '
    'a focused ~3-hour learning path) and "project" (<=10 words, a tiny build to '
    "prove it). No prose outside the JSON array."
)

_FULL_PROMPT = (
    "Organise this into a knowledge card. Return STRICT JSON with keys: "
    "title (<=8 words, no surrounding quotes), summary (<=25 words), "
    "tags (array of 3-5 lowercase keywords, no #), topic (1-2 words, the broad "
    "domain e.g. 'economics', 'react'), difficulty (integer 1-5, how hard the "
    "idea is to grasp), importance (integer 1-10, how worth revisiting later). "
    "Content:\n\n{text}"
)

_SOLVE_TASK_PROMPT = (
    "You are SparkDhi, a sharp, truthful, and highly capable AI reasoning partner and technical tutor. "
    "Solve the following question/task: \"{prompt}\". "
    "Subject Hint: {subject_hint}.\n\n"
    "RESPONSE PHILOSOPHY & ACCURACY REQUIREMENTS:\n"
    "1. Structure & Clarity:\n"
    "   - Direct Answer: 1–3 clear sentences stating the explicit answer, conclusion, or code summary immediately. For simple or factual questions, answer directly and concisely without forced boilerplate.\n"
    "   - Step-by-step Explanation: Clear, logical reasoning and derivations without exposing private chain-of-thought.\n"
    "   - Examples / Code: Include complete, runnable code inside clean markdown code blocks (e.g. ```python ... ```) only when relevant.\n"
    "   - Key Takeaways & Pitfalls: Highlight core principles, edge cases, or complexity analysis (Time & Space) where helpful.\n"
    "   - Follow-up Suggestions / Practice: 2 to 3 sharp practice problems or thoughtful follow-up questions formatted as: 'Problem: <question> | Answer: <explicit solution>'.\n"
    "2. Return STRICT JSON with keys:\n"
    "- \"subject\": string (e.g. 'Coding', 'Mathematics', 'Physics', 'Chemistry', 'Writing', 'Economics', 'Research', 'General Academic')\n"
    "- \"title\": string (short concise title, <=10 words)\n"
    "- \"solution\": string (direct answer: 1–3 sentences with explicit conclusion or solution summary)\n"
    "- \"steps\": array of 2-6 strings (numbered explicit step-by-step technical/analytical/mathematical derivations with code/working where appropriate)\n"
    "- \"formulas\": array of strings (exact formulas, time/space complexity metrics, or core rules used, e.g. 'Time Complexity: O(n log n)')\n"
    "- \"intuition\": string (1-2 sentences explaining intuitive reasoning, key takeaway, or pitfall to avoid)\n"
    "- \"practice\": array of 2-3 strings (format: 'Problem: <exercise question> | Answer: <explicit solution>')\n"
)

_CHAPTERING_PROMPT = (
    "You are SparkDhi Active Learning Engine. "
    "You are processing ACTUAL LEARNING MATERIAL TEXT for topic: \"{title}\".\n"
    "STRICT ANTI-HALLUCINATION REQUIREMENT: Use ONLY information contained in the provided material text below. "
    "Do NOT infer concepts or lessons merely from the title. Do NOT invent concepts, examples, facts, or explanations that are not supported by the source content.\n\n"
    "ACTUAL LEARNING MATERIAL:\n\"{transcript}\"\n\n"
    "TASK:\n"
    "1. Detect natural concept topic boundaries directly from the text.\n"
    "2. Divide into 2 to 6 natural concept micro-chapters based on actual content covered.\n"
    "3. For EACH chapter generate:\n"
    "   - \"title\": concise concept topic name\n"
    "   - \"start_time\": 0\n"
    "   - \"end_time\": 0\n"
    "   - \"transcript_segment\": actual text excerpt for this chapter\n"
    "   - \"short_explanation\": 2-3 sentence core summary of the actual concept taught\n"
    "   - \"key_concepts\": array of 2-4 string concept keywords directly from material\n"
    "   - \"learning_objective\": clear objective statement grounded in material\n"
    "   - \"difficulty\": \"Beginner\", \"Medium\", or \"Advanced\"\n"
    "   - \"recall_prompt\": active-recall prompt asking learner to explain concept in their own words\n"
    "   - \"quiz\": array of 2-4 questions grounded ONLY in this chapter's actual content (each with: \"question_type\": \"mcq\", \"question_text\", \"options\": [\"A\",\"B\",\"C\",\"D\"], \"correct_answer\", \"explanation\", \"concept_tag\")\n"
    "4. Generate \"mindmap_nodes\": array of concepts extracted directly from material for graph visualization (each with: \"node_key\", \"label\", \"parent_key\", \"concept_tag\", \"depth\").\n\n"
    "Return STRICT JSON with keys: \"subject\", \"chapters\", \"mindmap_nodes\"."
)

_ACTIVE_RECALL_PROMPT = (
    "You are SparkDhi Active Learning Evaluator. "
    "Evaluate the learner's self-explanation response for chapter: \"{chapter_title}\".\n\n"
    "CHAPTER TRANSCRIPT CONTENT:\n\"{transcript_segment}\"\n\n"
    "LEARNER ACTIVE RECALL RESPONSE:\n\"{user_response}\"\n\n"
    "EVALUATION CRITERIA:\n"
    "1. Calculate an \"understanding_score\" integer from 0 to 100 based on accuracy and completeness.\n"
    "2. List \"understood_concepts\" (array of strings concepts correctly described).\n"
    "3. List \"missing_concepts\" (array of strings important ideas omitted or incomplete).\n"
    "4. List \"misconceptions\" (array of strings inaccurate or mistaken points, if any).\n"
    "5. Provide a constructive 1-2 sentence \"recommendation\" highlighting strengths and guidance for next steps.\n\n"
    "Return STRICT JSON with keys: \"understanding_score\", \"understood_concepts\", \"missing_concepts\", \"misconceptions\", \"recommendation\"."
)

# --- Offline / Deterministic Helpers ----------------------------------------

def _mock(text: str) -> dict:
    low = text.lower()
    tags: list[str] = []
    for key, vals in _MOCK_TOPICS.items():
        if key in low:
            tags.extend(vals)
    if not tags:
        words = re.findall(r"[a-zA-Z]{5,}", low)
        tags = [w for w in dict.fromkeys(words)][:3] or ["note"]
    tags = list(dict.fromkeys(tags))[:5]
    first = re.split(r"[.!?\n]", text.strip())[0][:120].strip()
    return {"summary": first or "Saved note", "tags": tags}

def _normalise(d: dict, text: str) -> dict:
    summary = (d.get("summary") or "").strip()
    tags = [str(t).lstrip("#").lower().strip() for t in d.get("tags", []) if t]
    if not summary or not tags:
        fb = _mock(text)
        summary = summary or fb["summary"]
        tags = tags or fb["tags"]
    return {"summary": summary[:200], "tags": tags[:5]}

def _fallback_title(text: str) -> str:
    words = (text or "").strip().split()
    return " ".join(words[:7]) or "Untitled"

def _sympy_algebraic_solver(prompt: str, subject_hint: str = "") -> Optional[dict]:
    """Exact mathematical & algebraic solver using SymPy for offline accuracy."""
    try:
        import sympy as sp
        from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application

        clean_prompt = re.sub(r'^(solve|calculate|find|eval|evaluate|integrate|differentiate)\s+', '', prompt, flags=re.I).strip()
        transform = standard_transformations + (implicit_multiplication_application,)

        if "=" in clean_prompt:
            parts = clean_prompt.split("=")
            x = sp.Symbol('x')
            left_expr = parse_expr(parts[0].replace("^", "**"), transformations=transform)
            right_expr = parse_expr(parts[1].replace("^", "**"), transformations=transform)
            eq = left_expr - right_expr

            sols = sp.solve(eq, x)
            factored = sp.factor(eq)

            sols_str = ", ".join(f"x = {s}" for s in sols)
            steps = [
                f"Write equation in standard form: {eq} = 0",
                f"Factorize expression: {factored} = 0",
                f"Solve linear factors for x: {sols_str}",
                "Verify solutions by substituting back into original equation.",
            ]

            return {
                "subject": "Mathematics",
                "icon": "🧮",
                "title": f"Solve {prompt.strip()}",
                "solution": f"Solutions: {sols_str}",
                "steps": steps,
                "formulas": [
                    "Quadratic Formula: x = (-b ± √(b² - 4ac)) / (2a)",
                    "Factorization Rule: ax² + bx + c = (mx + p)(nx + q)",
                ],
                "intuition": "The solutions (roots) represent the x-intercepts where the quadratic function equals zero.",
                "practice": [
                    "Problem: Solve 3x² - 7x + 2 = 0 | Answer: x = 2, x = 1/3",
                    "Problem: Solve x² - 9 = 0 | Answer: x = 3, x = -3",
                    "Problem: Solve x² - 6x + 9 = 0 | Answer: x = 3 (repeated root)",
                ],
            }
    except Exception as e:
        print(f"[sympy_solver] parsing skipped: {_sanitize_log(str(e))}")
    return None

def _offline_dynamic_task_solver(prompt: str, subject_hint: str = "") -> dict:
    """Offline heuristic task solver for local development and test runs without API keys."""
    low = (prompt or "").lower()
    is_coding = subject_hint.lower() == "coding" or any(
        k in low for k in ["code", "python", "javascript", "js", "ts", "typescript", "java", "c++", "cpp", "sql", "function", "array", "algorithm", "string", "loop", "debug", "write a function"]
    )

    if is_coding:
        lang = "python"
        if "javascript" in low or " js " in low or "node" in low:
            lang = "javascript"
        elif "typescript" in low or " ts " in low:
            lang = "typescript"
        elif "c++" in low or "cpp" in low:
            lang = "cpp"
        elif "java" in low:
            lang = "java"
        elif "sql" in low:
            lang = "sql"

        if "reverse" in low and "string" in low:
            if lang == "python":
                code_snippet = "def reverse_string(s: str) -> str:\n    # Optimized Pythonic string reversal using slice\n    return s[::-1]\n\n# Test execution\nprint(reverse_string('spark_ai'))  # Output: ia_kraps"
            elif lang == "javascript":
                code_snippet = "function reverseString(str) {\n  // Split into character array, reverse, and join\n  return str.split('').reverse().join('');\n}\n\nconsole.log(reverseString('spark_ai')); // Output: ia_kraps"
            else:
                code_snippet = f"//{lang.capitalize()} String Reversal Solution\nString reverse(String input) {{\n    return new StringBuilder(input).reverse().toString();\n}}"
            proc_title = "String Reversal Solution"
        elif "fibonacci" in low:
            if lang == "python":
                code_snippet = "def fibonacci(n: int) -> int:\n    if n <= 0: return 0\n    if n == 1: return 1\n    a, b = 0, 1\n    for _ in range(2, n + 1):\n        a, b = b, a + b\n    return b\n\nprint([fibonacci(i) for i in range(10)])"
            else:
                code_snippet = "function fibonacci(n) {\n  let a = 0, b = 1;\n  for (let i = 2; i <= n; i++) {\n    let temp = a + b;\n    a = b;\n    b = temp;\n  }\n  return n === 0 ? 0 : b;\n}"
            proc_title = "Fibonacci Sequence Solution"
        elif "binary search" in low or "search" in low:
            if lang == "python":
                code_snippet = "def binary_search(arr: list[int], target: int) -> int:\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    return -1\n\n# Test sorted array\nprint(binary_search([1, 3, 5, 7, 9, 11], 7)) # Output: 3"
            else:
                code_snippet = "function binarySearch(arr, target) {\n  let left = 0, right = arr.length - 1;\n  while (left <= right) {\n    let mid = Math.floor((left + right) / 2);\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) left = mid + 1;\n    else right = mid - 1;\n  }\n  return -1;\n}"
            proc_title = "Binary Search Algorithm Solution"
        else:
            clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', prompt.strip()[:30]).lower().strip('_') or "solve_task"
            if lang == "python":
                code_snippet = f"def {clean_name}(data):\n    \"\"\"Optimal solution for: {prompt.strip()[:80]}\"\"\"\n    if not data:\n        return None\n    result = []\n    for item in data:\n        if item is not None:\n            result.append(item)\n    return result\n\n# Example Test\nprint({clean_name}([1, 2, 3, None, 5]))"
            else:
                code_snippet = f"function {clean_name}(data) {{\n  // Solution for: {prompt.strip()[:80]}\n  if (!Array.isArray(data)) return [];\n  return data.filter(item => item !== null);\n}}\n\nconsole.log({clean_name}([1, 2, 3, null, 5]));"
            proc_title = f"Code Solution: {prompt.strip()[:50]}"

        return {
            "subject": "Coding",
            "icon": "💻",
            "title": proc_title,
            "solution": f"Here is the complete working {lang.capitalize()} code solution with step-by-step technical explanation and complexity analysis.",
            "steps": [
                f"1. Problem Analysis & Language Selection: Targeted language is **{lang.capitalize()}**.",
                f"2. Complete Working Implementation:\n```{lang}\n{code_snippet}\n```",
                "3. Step-by-Step Explanation:\n- Evaluates input boundary conditions and null checks.\n- Executes optimal algorithm logic to return the computed result.",
                "4. Complexity Analysis:\n- Time Complexity: O(N) linear time for N input elements.\n- Space Complexity: O(1) auxiliary space.",
            ],
            "formulas": [
                f"Language: {lang.capitalize()}",
                "Time Complexity: O(N)",
                "Space Complexity: O(1)",
            ],
            "intuition": f"Using native {lang.capitalize()} constructs ensures optimal performance, clarity, and memory safety.",
            "practice": [
                f"Problem: How do you handle empty inputs in {lang.capitalize()}? | Answer: Add an early return guard check at the start of the function.",
                "Problem: What is the benefit of linear time complexity? | Answer: Execution time scales linearly with input size, preventing performance bottlenecks.",
            ],
        }

    clean_p = prompt.strip()[:60]
    return {
        "subject": subject_hint.capitalize() if subject_hint else "General Academic",
        "icon": "📚",
        "title": f"Solution: {clean_p}",
        "solution": f"Here is the step-by-step academic analysis for: \"{prompt.strip()}\".",
        "steps": [
            f"1. Core Problem Definition: Analyze key terms and context in '{clean_p}'.",
            f"2. Methodological Approach: Break down the problem into structured analytical sub-components.",
            f"3. Final Synthesis & Result: Apply core subject principles to reach a clear, evidence-based conclusion.",
        ],
        "formulas": [
            "Analytical Framework: Problem Identification ➔ Structural Decomposition ➔ Synthesis",
        ],
        "intuition": "Decomposing complex queries into logical steps ensures clarity and academic rigor.",
        "practice": [
            f"Problem: What is the first step when tackling {clean_p}? | Answer: Identify baseline definitions and given conditions.",
        ],
    }

def _heuristic_concept_chapters(transcript_text: str, title: str = "Active Study Session") -> dict:
    """Offline heuristic chapter generator derived directly from source transcript."""
    raw_text = (transcript_text or "").strip()
    words = raw_text.split()
    total_words = max(50, len(words))
    est_duration = max(300, int(total_words / 2.5))

    stop_words = {
        "the", "a", "an", "in", "on", "of", "and", "or", "to", "is", "are", "was", "were", "for", "with", "this", "that", "from", "by", "at", "it", "as", "be", "has", "have", "had",
        "going", "just", "like", "want", "here", "there", "you", "your", "we", "our", "us", "they", "them", "their", "what", "which", "who", "whom", "where", "when", "why", "how",
        "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "can", "will", "just",
        "don't", "it's", "that's", "i'm", "we're", "you're", "they're", "there's", "here's", "know", "think", "mean", "right", "well", "look", "see", "get", "got", "make", "take",
        "thing", "things", "way", "lot", "kind", "sort", "basically", "actually", "literally", "yeah", "okay", "alright", "hello", "welcome", "today", "now", "also", "into", "about"
    }
    clean_words = [w.strip(".,!?:;\"'()[]{}").capitalize() for w in words if len(w.strip(".,!?:;\"'()[]{}")) > 3 and w.lower() not in stop_words]
    freq: dict[str, int] = {}
    for w in clean_words:
        freq[w] = freq.get(w, 0) + 1
    top_terms = [k for k, v in sorted(freq.items(), key=lambda item: item[1], reverse=True)[:9]]

    if len(top_terms) < 6:
        top_terms.extend(["Concept Principles", "Analytical Framework", "System Interactions", "Practical Execution", "Problem Solving", "Key Synthesis"])

    chunk_size = max(1, len(words) // 3)
    chap1_text = " ".join(words[:chunk_size]) or raw_text[:500]
    chap2_text = " ".join(words[chunk_size:chunk_size * 2]) or raw_text[500:1000]
    chap3_text = " ".join(words[chunk_size * 2:]) or raw_text[1000:]

    t1_end = int(est_duration * 0.33)
    t2_end = int(est_duration * 0.67)

    c1_tags = top_terms[0:3]
    c2_tags = top_terms[3:6]
    c3_tags = top_terms[6:9] if len(top_terms) >= 9 else top_terms[0:3]
    clean_title = title[:40] if title else top_terms[0]

    return {
        "subject": "General Academic",
        "chapters": [
            {
                "title": f"1. Introduction to {c1_tags[0]}",
                "start_time": 0,
                "end_time": t1_end,
                "duration_seconds": t1_end,
                "transcript_segment": chap1_text[:600],
                "short_explanation": f"Examines foundational concepts around {c1_tags[0]} and {c1_tags[1]} in {clean_title}.",
                "key_concepts": c1_tags,
                "learning_objective": f"Understand core definitions of {c1_tags[0]} and how it establishes baseline principles.",
                "difficulty": "Beginner",
                "recall_prompt": f"Before continuing, explain the main idea of {c1_tags[0]} in your own words.",
                "quiz": [
                    {
                        "question_type": "mcq",
                        "question_text": f"What is the core focus of {c1_tags[0]} in this topic?",
                        "options": [f"A. Establishing baseline principles of {c1_tags[0]}", "B. Ignoring foundational definitions", "C. Skipping preliminary analysis", "D. None of the above"],
                        "correct_answer": f"A. Establishing baseline principles of {c1_tags[0]}",
                        "explanation": f"Focusing on {c1_tags[0]} establishes essential baseline principles.",
                        "concept_tag": c1_tags[0],
                    },
                    {
                        "question_type": "true_false",
                        "question_text": f"Understanding {c1_tags[1]} is essential for analyzing overall {clean_title} concepts.",
                        "options": ["True", "False"],
                        "correct_answer": "True",
                        "explanation": f"{c1_tags[1]} provides key structural context.",
                        "concept_tag": c1_tags[1],
                    }
                ],
            },
            {
                "title": f"2. Mechanics of {c2_tags[0]}",
                "start_time": t1_end,
                "end_time": t2_end,
                "duration_seconds": t2_end - t1_end,
                "transcript_segment": chap2_text[:600],
                "short_explanation": f"Analyzes relationships between {c2_tags[0]} and {c2_tags[1]}.",
                "key_concepts": c2_tags,
                "learning_objective": f"Analyze how {c2_tags[0]} interacts with other components to produce target outcomes.",
                "difficulty": "Medium",
                "recall_prompt": f"Describe the main mechanism of {c2_tags[0]} explained in this section.",
                "quiz": [
                    {
                        "question_type": "mcq",
                        "question_text": f"How does {c2_tags[0]} function within the system?",
                        "options": [f"A. By interacting directly with {c2_tags[1]}", "B. Completely independently without input", "C. Randomly without structure", "D. Only during shutdown"],
                        "correct_answer": f"A. By interacting directly with {c2_tags[1]}",
                        "explanation": f"{c2_tags[0]} functions through structured interactions with {c2_tags[1]}.",
                        "concept_tag": c2_tags[0],
                    }
                ],
            },
            {
                "title": f"3. Applications of {c3_tags[0]}",
                "start_time": t2_end,
                "end_time": est_duration,
                "duration_seconds": est_duration - t2_end,
                "transcript_segment": chap3_text[:600],
                "short_explanation": f"Synthesizes practical applications and advanced problem solving for {c3_tags[0]}.",
                "key_concepts": c3_tags,
                "learning_objective": f"Apply knowledge of {c3_tags[0]} to solve practical real-world problems.",
                "difficulty": "Advanced",
                "recall_prompt": f"How would you apply what you learned about {c3_tags[0]} to solve a new practical problem?",
                "quiz": [
                    {
                        "question_type": "mcq",
                        "question_text": f"Which strategy optimizes real-world execution of {c3_tags[0]}?",
                        "options": [f"A. Applying structured methods for {c3_tags[0]}", "B. Ignoring edge conditions", "C. Avoiding testing", "D. Guessing outputs"],
                        "correct_answer": f"A. Applying structured methods for {c3_tags[0]}",
                        "explanation": f"Structured methods guarantee reliable execution for {c3_tags[0]}.",
                        "concept_tag": c3_tags[0],
                    }
                ],
            },
        ],
        "mindmap_nodes": [
            {"node_key": "root", "label": clean_title, "parent_key": None, "concept_tag": "Main Topic", "depth": 0},
            {"node_key": "c1", "label": c1_tags[0], "parent_key": "root", "concept_tag": c1_tags[0], "depth": 1},
            {"node_key": "c2", "label": c2_tags[0], "parent_key": "root", "concept_tag": c2_tags[0], "depth": 1},
            {"node_key": "c3", "label": c3_tags[0], "parent_key": "root", "concept_tag": c3_tags[0], "depth": 1},
        ],
    }

def _heuristic_active_recall(user_recall_text: str) -> dict:
    """Offline heuristic active recall evaluation."""
    length = len((user_recall_text or "").strip().split())
    if length > 25:
        score = 85
        recom = "Great job explaining the concept! You captured the main ideas well. Keep building on this understanding."
        understood = ["Core Definition", "Primary Mechanism"]
        missing: list[str] = []
        misconceptions: list[str] = []
    elif length >= 8:
        score = 70
        recom = "Good recall effort! You understand the primary idea, but try to include key relationships and details next time."
        understood = ["Main Idea"]
        missing = ["Specific Relationships & Details"]
        misconceptions = []
    else:
        score = 45
        recom = "Brief answer. Review the micro-chapter summary and try explaining the core relationships in your own words."
        understood = ["General Topic"]
        missing = ["Core Explanation", "Key Principles"]
        misconceptions = ["Incomplete Coverage"]

    return {
        "understanding_score": score,
        "understood_concepts": understood,
        "missing_concepts": missing,
        "misconceptions": misconceptions,
        "recommendation": recom,
    }

# --- Backward-Compatible Internal Callers -----------------------------------

def _complete_text(prompt: str) -> str:
    router = get_model_router()
    return router.generate_text(prompt)

def _complete_vision(prompt: str, image_b64: str, mime_type: str = "image/jpeg") -> str:
    router = get_model_router()
    return router.generate_text(prompt, vision=True, image_b64=image_b64, mime_type=mime_type)

def _complete(prompt: str) -> str:
    return _complete_text(prompt)

def _openrouter(text: str) -> dict:
    adapter = OpenRouterAdapter()
    raw = adapter.complete_text(_PROMPT.format(text=text), timeout=30.0)
    return _normalise(_extract_json(raw), text)

def _groq(text: str) -> dict:
    adapter = GroqAdapter()
    raw = adapter.complete_text(_PROMPT.format(text=text), timeout=30.0)
    return _normalise(_extract_json(raw), text)

def _gemini(text: str) -> dict:
    adapter = GeminiAdapter()
    raw = adapter.complete_text(_PROMPT.format(text=text), timeout=30.0)
    return _normalise(_extract_json(raw), text)

def _xai(text: str) -> dict:
    adapter = XAIAdapter()
    raw = adapter.complete_text(_PROMPT.format(text=text), timeout=30.0)
    return _normalise(_extract_json(raw), text)

def _anthropic(text: str) -> dict:
    adapter = AnthropicAdapter()
    raw = adapter.complete_text(_PROMPT.format(text=text), timeout=30.0)
    return _normalise(_extract_json(raw), text)

def _openrouter_text(prompt: str) -> str:
    return OpenRouterAdapter().complete_text(prompt, timeout=45.0)

def _groq_text(prompt: str) -> str:
    return GroqAdapter().complete_text(prompt, timeout=40.0)

def _gemini_text(prompt: str) -> str:
    return GeminiAdapter().complete_text(prompt, timeout=40.0)

def _xai_text(prompt: str) -> str:
    return XAIAdapter().complete_text(prompt, timeout=45.0)

def _anthropic_text(prompt: str) -> str:
    return AnthropicAdapter().complete_text(prompt, timeout=40.0)

def _openrouter_vision(prompt: str, image_b64: str, mime_type: str = "image/jpeg") -> str:
    return OpenRouterAdapter().complete_vision(prompt, image_b64, mime_type=mime_type, timeout=45.0)

def _gemini_vision(prompt: str, image_b64: str, mime_type: str = "image/jpeg") -> str:
    return GeminiAdapter().complete_vision(prompt, image_b64, mime_type=mime_type, timeout=45.0)

def _xai_vision(prompt: str, image_b64: str, mime_type: str = "image/jpeg") -> str:
    return XAIAdapter().complete_vision(prompt, image_b64, mime_type=mime_type, timeout=45.0)

def _anthropic_vision(prompt: str, image_b64: str, mime_type: str = "image/jpeg") -> str:
    return AnthropicAdapter().complete_vision(prompt, image_b64, mime_type=mime_type, timeout=45.0)


# --- Public High-Level APIs -------------------------------------------------

def enrich(text: str) -> dict:
    """Return {'summary': str, 'tags': [str]} for a raw note. Never raises."""
    if not text or not text.strip():
        return {"summary": "Empty note", "tags": ["note"]}
    router = get_model_router()
    if router.has_configured_real_providers():
        try:
            raw = router.generate_text(_PROMPT.format(text=text))
            d = _extract_json(raw)
            return _normalise(d, text)
        except Exception as e:
            print(f"[llm] enrich failed, falling back to mock: {_sanitize_log(str(e))}")
    return _mock(text)


def enrich_full(text: str, source_type: str = "text") -> dict:
    """Full knowledge-object metadata, with graceful offline fallback."""
    base = _mock(text)
    router = get_model_router()
    d = {}
    if router.has_configured_real_providers():
        try:
            raw = router.generate_text(_FULL_PROMPT.format(text=(text or "")[:6000]))
            d = _extract_json(raw)
        except Exception as e:
            print(f"[llm] enrich_full fell back to mock: {_sanitize_log(str(e))}")

    title = (str(d.get("title") or "").strip().strip('"')) or _fallback_title(text)
    summary = (str(d.get("summary") or "").strip()) or base["summary"]
    tags = [str(t).lstrip("#").lower().strip() for t in d.get("tags", []) if t] or base["tags"]
    topic = (str(d.get("topic") or "").strip().lower()) or (tags[0] if tags else "general")
    try:
        difficulty = max(1, min(5, int(d.get("difficulty", 2))))
    except Exception:
        difficulty = 2
    try:
        importance = max(1, min(10, int(d.get("importance", 5))))
    except Exception:
        importance = 5
    return {
        "title": title[:80],
        "summary": summary[:200],
        "tags": tags[:5],
        "topic": topic[:30],
        "difficulty": difficulty,
        "importance": importance,
    }


def synthesize(query: str, notes: list[str]) -> str:
    """Draft a connected summary from matching cards. Offline-safe."""
    joined = "\n".join(f"- {n}" for n in notes[:25])[:6000]
    prompt = _SYNTH_PROMPT.format(q=query, notes=joined)
    router = get_model_router()
    if router.has_configured_real_providers():
        try:
            return router.generate_text(prompt)
        except Exception as e:
            print(f"[llm] synth failed, using mock: {_sanitize_log(str(e))}")
    head = f"On \"{query}\", you have {len(notes)} related note(s)."
    bullets = "\n".join(f"• {n[:140]}" for n in notes[:5])
    return f"{head}\n{bullets}" if bullets else f"No saved notes match \"{query}\" yet."


def draft(instruction: str, notes: list[str]) -> str:
    """Generate a piece of writing FROM saved cards. Offline-safe."""
    joined = "\n".join(f"- {n}" for n in notes[:25])[:6000]
    prompt = _DRAFT_PROMPT.format(instruction=instruction, notes=joined)
    router = get_model_router()
    if router.has_configured_real_providers():
        try:
            return router.generate_text(prompt)
        except Exception as e:
            print(f"[llm] draft failed, using mock: {_sanitize_log(str(e))}")
    if not notes:
        return f"I don't have any saved notes to draft \"{instruction}\" from yet — capture a few first."
    return f"[Draft based on {len(notes)} note(s)]\n" + " ".join(n[:200] for n in notes[:3])


def learning_plan(gaps: list[dict]) -> list[dict]:
    """Draft a per-gap learning plan. Offline-safe (templated fallback)."""
    if not gaps:
        return []
    names = ", ".join(g["skill"] for g in gaps)
    prompt = _PLAN_PROMPT.format(skills=names)
    router = get_model_router()
    if router.has_configured_real_providers():
        try:
            raw = router.generate_text(prompt)
            arr = _extract_json_array(raw)
            if arr:
                return arr
        except Exception as e:
            print(f"[llm] learning_plan failed, using template: {_sanitize_log(str(e))}")
    return [{
        "skill": g["skill"],
        "why": f"High market demand ({int(g['demand']*100)}%) and currently a gap.",
        "plan": f"Spend ~3 hours on a focused {g['skill']} tutorial, then apply it once.",
        "project": f"Add {g['skill']} to a small existing project.",
    } for g in gaps]


def solve_student_task(
    prompt: str,
    subject_hint: str = "",
    image_b64: Optional[str] = None,
    mime_type: str = "image/jpeg",
) -> dict:
    """Solve an academic question or task using resilient multi-provider router or offline solver."""
    p_text = _SOLVE_TASK_PROMPT.format(prompt=(prompt or "")[:12000], subject_hint=subject_hint or "General")
    router = get_model_router()

    # 1. Real Provider Route: Attempt router if any real providers are configured
    if router.has_configured_real_providers():
        try:
            parsed = router.generate_structured(
                prompt=p_text,
                schema=TaskSolutionSchema,
                vision=bool(image_b64),
                image_b64=image_b64,
                mime_type=mime_type,
            )
            # Ensure practice strings are formatted cleanly
            if "practice" in parsed and isinstance(parsed["practice"], list):
                parsed["practice"] = [str(pr).strip() for pr in parsed["practice"] if pr]
            return parsed
        except (AIServiceUnavailableError, LLMError) as e:
            # In production with configured providers, do NOT fabricate fake mock solutions on failure
            raise AIServiceUnavailableError("AI service is temporarily unavailable. Please try again shortly.") from e
        except Exception as e:
            raise AIServiceUnavailableError("AI service is temporarily unavailable. Please try again shortly.") from e

    # 2. Offline / Local Dev mode (when no API keys are configured, or llm_provider == 'mock'):
    # Check exact SymPy symbolic solver for mathematical queries
    sympy_res = _sympy_algebraic_solver(prompt, subject_hint)
    if sympy_res:
        return sympy_res

    # Dynamic fallback generator for coding and general academic queries
    return _offline_dynamic_task_solver(prompt, subject_hint)


def solve_task_followup(
    task_prompt: str,
    task_solution: str,
    thread: list[dict],
    followup_text: str,
) -> str:
    """Answer a follow-up question for an ongoing student task thread."""
    history = "\n".join(f"{m.get('role','user').capitalize()}: {m.get('content','')}" for m in (thread or [])[-6:])
    p_text = (
        f"You are SparkDhi, a sharp, truthful, and highly capable AI reasoning partner.\n"
        f"ORIGINAL TASK: \"{task_prompt}\"\n"
        f"INITIAL SOLUTION: \"{task_solution}\"\n"
        f"PAST CONVERSATION:\n{history}\n\n"
        f"STUDENT FOLLOW-UP QUESTION: \"{followup_text}\"\n\n"
        "Provide a direct, truthful, and sharp answer to the student's follow-up question. "
        "Use step-by-step explanation or clean runnable code if relevant. "
        "For simple questions, answer concisely without boilerplate."
    )
    router = get_model_router()
    if router.has_configured_real_providers():
        try:
            return router.generate_text(p_text)
        except Exception as e:
            raise AIServiceUnavailableError("AI service is temporarily unavailable. Please try again shortly.") from e
    return f"Explanation for '{followup_text}': Contextual clarification based on initial solution '{task_solution[:60]}'."


def generate_concept_chapters(
    transcript_text: str,
    title: str = "Active Study Session",
) -> dict:
    """Analyze learning transcript and generate natural concept-based micro-chapters, quizzes, and mindmap."""
    p_text = _CHAPTERING_PROMPT.format(title=title[:200], transcript=(transcript_text or "")[:25000])
    router = get_model_router()
    if router.has_configured_real_providers():
        try:
            parsed = router.generate_structured(p_text, schema=StudyChaptersSchema)
            if parsed and "chapters" in parsed and len(parsed["chapters"]) > 0:
                return parsed
        except Exception as e:
            print(f"[llm] generate_concept_chapters LLM error, using heuristic fallback: {_sanitize_log(str(e))}")

    # Offline / heuristic fallback
    return _heuristic_concept_chapters(transcript_text, title)


def evaluate_active_recall(
    chapter_title: str,
    transcript_segment: str,
    user_recall_text: str,
) -> dict:
    """Evaluate learner active recall response using LLM or intelligent heuristic parser."""
    p_text = _ACTIVE_RECALL_PROMPT.format(
        chapter_title=chapter_title[:100],
        transcript_segment=(transcript_segment or "")[:3000],
        user_response=(user_recall_text or "")[:2000],
    )
    router = get_model_router()
    if router.has_configured_real_providers():
        try:
            parsed = router.generate_structured(p_text, schema=ActiveRecallSchema)
            if parsed and "understanding_score" in parsed:
                return parsed
        except Exception as e:
            print(f"[llm] evaluate_active_recall LLM error, using heuristic fallback: {_sanitize_log(str(e))}")

    # Offline / heuristic fallback
    return _heuristic_active_recall(user_recall_text)
