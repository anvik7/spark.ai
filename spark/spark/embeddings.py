"""Embeddings for semantic search.

Uses Google's `text-embedding-004` when GEMINI_API_KEY is set (true semantic
meaning); otherwise falls back to a local lexical hashing vector so search still
runs offline. Vectors are L2-normalised, so cosine similarity is just a dot
product. Ranking is done in Python — fine for a personal knowledge base; swap to
pgvector at deploy scale. (Groq has no embedding API, so this uses the Gemini
key independently of whatever llm_provider you use for chat/tagging.)
"""
import hashlib
import math
import re

import httpx

from .config import get_settings

settings = get_settings()
_TOKEN = re.compile(r"[a-z0-9]+")
_LOCAL_DIM = 256


def _normalize(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def _local_embed(text: str) -> list[float]:
    """Hashing bag-of-words vector. Lexical, not semantic — the offline floor."""
    vec = [0.0] * _LOCAL_DIM
    for tok in _TOKEN.findall(text.lower()):
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        vec[h % _LOCAL_DIM] += 1.0
    return _normalize(vec)


def _gemini_embed(text: str) -> list[float]:
    model = "text-embedding-004"
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{model}:embedContent?key={settings.gemini_api_key}")
    r = httpx.post(url, json={
        "model": f"models/{model}",
        "content": {"parts": [{"text": text[:8000]}]},
    }, timeout=30)
    r.raise_for_status()
    return _normalize(r.json()["embedding"]["values"])


def embed(text: str) -> list[float]:
    text = (text or "").strip()
    if not text:
        return [0.0] * _LOCAL_DIM
    if settings.gemini_api_key:
        try:
            return _gemini_embed(text)
        except Exception as e:
            print(f"[embed] gemini failed, using local fallback: {e}")
    return _local_embed(text)


def cosine(a: list[float], b: list[float]) -> float:
    # both vectors are already normalised; mismatched dims => not comparable
    if not a or not b or len(a) != len(b):
        return -1.0
    return sum(x * y for x, y in zip(a, b))
