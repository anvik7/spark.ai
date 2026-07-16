"""Daily digest — a 'Today' brief.

Surfaces cards due for spaced-repetition review plus a couple of older cards for
serendipitous rediscovery, and an AI-written 2-3 sentence thread tying them
together. Computed on demand for the current day — no cron needed; real
push/email delivery is a later infra step.

Self-contained LLM dispatch (groq/gemini/anthropic) with a graceful template
fallback, so it doesn't depend on other modules.
"""
import random

import httpx

from .config import get_settings

settings = get_settings()

_PROMPTS = [
    "What's one idea here you could act on today?",
    "Which of these connects to something you're working on right now?",
    "If you had to teach one of these to a friend, which would it be?",
    "What's missing from this picture that you'd like to capture next?",
    "Which of these felt true a month ago — and still does?",
]


def _llm(prompt: str, max_tokens: int = 300) -> str:
    p = settings.llm_provider
    if p == "groq" and settings.groq_api_key:
        r = httpx.post("https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json={"model": settings.llm_model or "llama-3.3-70b-versatile",
                  "messages": [{"role": "user", "content": prompt}]}, timeout=40)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    if p == "gemini" and settings.gemini_api_key:
        model = settings.llm_model or "gemini-2.0-flash"
        r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/"
                       f"{model}:generateContent?key={settings.gemini_api_key}",
                       json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=40)
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    if p == "anthropic" and settings.anthropic_api_key:
        r = httpx.post("https://api.anthropic.com/v1/messages",
            headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01"},
            json={"model": settings.llm_model or "claude-haiku-4-5-20251001",
                  "max_tokens": max_tokens,
                  "messages": [{"role": "user", "content": prompt}]}, timeout=40)
        r.raise_for_status()
        return r.json()["content"][0]["text"].strip()
    raise RuntimeError("no LLM provider configured")


def _briefing(cards: list[dict]) -> str:
    if not cards:
        return ""
    titles = "; ".join((c.get("summary") or c.get("raw", ""))[:80] for c in cards[:6])
    prompt = ("In 2-3 warm, reflective sentences, tie together today's notes into "
              "a single thread a person would enjoy reading with their coffee. "
              f"Don't list them mechanically. Notes: {titles}")
    try:
        return _llm(prompt)
    except Exception as e:
        print(f"[digest] LLM briefing unavailable, using template: {e}")
        return ("A few ideas resurface today. Give them a second look — the "
                "connection you missed the first time is often the useful one.")


def build_digest(due: list[dict], extra: list[dict]) -> dict:
    picks = (due or []) + (extra or [])
    return {
        "due_count": len(due or []),
        "rediscover_count": len(extra or []),
        "cards": picks,
        "briefing": _briefing(picks),
        "prompt": random.choice(_PROMPTS),
    }
