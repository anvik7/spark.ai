"""Adaptive morning-memory engine.

Instead of random or merely-due cards, every older card is scored by three
signals and the best are resurfaced each morning:

    score = 0.45 * connection + 0.30 * importance + 0.25 * forgotten

  • connection — cosine similarity to the cards you saved this week (this is
    "today it connects with N new ideas"). Embeddings find candidates; the AI
    writes the one-line explanation for the hero card (hybrid).
  • importance — the AI-assigned 1-10 score on the card.
  • forgotten  — how long ago it was saved (older, unseen = higher).

Computed on demand for the current day. Self-contained LLM with template
fallback, so it never blocks.
"""
import random
import statistics
from datetime import date, datetime

import httpx

from .config import get_settings
from .embeddings import cosine

settings = get_settings()

_PROMPTS = [
    "What's one idea here you could act on today?",
    "Which of these connects to something you're working on right now?",
    "If you had to teach one of these to a friend, which would it be?",
    "What's missing from this picture you'd like to capture next?",
]
_RECENT_DAYS = 7
_CONNECT_THRESHOLD = 0.32


def _llm(prompt: str, max_tokens: int = 200) -> str:
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


def _greeting() -> str:
    h = datetime.now().hour
    return "Good morning" if h < 12 else "Good afternoon" if h < 18 else "Good evening"


def _age_days(created) -> int:
    if not created:
        return 0
    if isinstance(created, str):
        try:
            created = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except Exception:
            return 0
    d = created.date() if isinstance(created, datetime) else created
    try:
        return max(0, (date.today() - d).days)
    except Exception:
        return 0


def _label(card: dict) -> str:
    return (card.get("title") or card.get("summary") or card.get("raw", ""))[:80]


def _hero_why(hero: dict, connected: list[dict], age: int) -> str:
    if not connected:
        return ""
    others = "; ".join(_label(c) for c in connected[:3])
    prompt = (f"A user saved this note {age} days ago: \"{_label(hero)}\". "
              f"This week they saved related notes: {others}. In ONE warm sentence "
              f"(<=25 words), tell them why revisiting the old note now is worth it.")
    try:
        return _llm(prompt)
    except Exception as e:
        print(f"[memory] hero line fell back to template: {e}")
        n = len(connected)
        return (f"It lines up with {n} idea{'s' if n != 1 else ''} you captured this "
                f"week — worth a second look while the thread is fresh.")


def build_morning(items: list[tuple[dict, list[float]]], due_count: int = 0) -> dict:
    recent, older = [], []
    for card, vec in items:
        (recent if _age_days(card.get("created_at")) <= _RECENT_DAYS else older).append((card, vec))

    scored = []
    for card, vec in older:
        sims = sorted(((cosine(vec, rv), rc) for rc, rv in recent),
                      key=lambda x: x[0], reverse=True) if vec else []
        sim_vals = [s for s, _ in sims]
        # Relative threshold: "connected" means notably above this card's own
        # average similarity to the week's cards — works whether the embedding
        # baseline is low (lexical) or high (Gemini).
        if len(sim_vals) >= 2:
            thr = max(statistics.mean(sim_vals) + 0.5 * statistics.pstdev(sim_vals), 0.05)
        elif sim_vals:
            thr = 0.10
        else:
            thr = 1.0
        connected = [rc for s, rc in sims if s > thr][:5]
        conn_strength = sims[0][0] if sims else 0.0
        age = _age_days(card.get("created_at"))
        forgotten = min(1.0, age / 60)
        importance = (card.get("importance") or 0) / 10
        score = 0.45 * conn_strength + 0.30 * importance + 0.25 * forgotten
        scored.append({"card": card, "age": age, "score": score,
                       "connected": connected, "n_connect": len(connected)})

    scored.sort(key=lambda x: -x["score"])

    # Fallback for fresh accounts (no older cards yet): surface important / recent.
    if not scored:
        pool = sorted(items, key=lambda iv: -(iv[0].get("importance") or 0))
        cards = [c for c, _ in pool[:4]]
        return {
            "greeting": _greeting(),
            "headline": "Your collection is just getting started — keep capturing.",
            "hero": None,
            "resurfaced": [{"card": c, "age": _age_days(c.get("created_at")),
                            "reason": "Worth keeping in view", "n_connect": 0} for c in cards],
            "due_count": due_count,
            "prompt": random.choice(_PROMPTS),
        }

    top = scored[:4]
    hero = top[0]
    why = _hero_why(hero["card"], hero["connected"], hero["age"]) if hero["n_connect"] else ""
    if hero["n_connect"]:
        headline = (f"You saved this {hero['age']} days ago — today it connects with "
                    f"{hero['n_connect']} new idea{'s' if hero['n_connect'] != 1 else ''}.")
    elif (hero["card"].get("importance") or 0) >= 7:
        headline = f"An important idea from {hero['age']} days ago, back for review."
    else:
        headline = f"From {hero['age']} days ago — still worth a second look."

    def _reason(row):
        if row["n_connect"]:
            return f"Connects with {row['n_connect']} recent idea{'s' if row['n_connect'] != 1 else ''}"
        if (row["card"].get("importance") or 0) >= 7:
            return "Marked important"
        return f"Saved {row['age']} days ago"

    return {
        "greeting": _greeting(),
        "headline": headline,
        "hero": {"card": hero["card"], "age": hero["age"],
                 "n_connect": hero["n_connect"], "why": why,
                 "connects": [c for c in hero["connected"][:3]]},
        "resurfaced": [{"card": r["card"], "age": r["age"],
                        "reason": _reason(r), "n_connect": r["n_connect"]} for r in top[1:]],
        "due_count": due_count,
        "prompt": random.choice(_PROMPTS),
    }


def build_weekly(items: list[tuple[dict, list[float]]]) -> dict:
    """A 7-day rollup: what got captured, what's most important, and one
    AI-written throughline connecting the week. Reuses build_morning's scoring
    so both stay consistent."""
    week_cards = [c for c, _ in items if _age_days(c.get("created_at")) <= 7]
    if not week_cards:
        return {"headline": "Nothing captured this week yet.", "count": 0,
                "top_cards": [], "throughline": ""}

    top = sorted(week_cards, key=lambda c: -(c.get("importance") or 0))[:5]
    labels = "; ".join(_label(c) for c in top)
    prompt = (f"A user captured {len(week_cards)} notes this week, including: {labels}. "
              f"In ONE encouraging sentence (<=25 words), name the throughline connecting "
              f"what they focused on this week.")
    try:
        throughline = _llm(prompt)
    except Exception as e:
        print(f"[memory] weekly throughline fell back to template: {e}")
        throughline = f"You captured {len(week_cards)} notes this week — steady progress."

    return {
        "headline": f"{len(week_cards)} notes captured this week",
        "count": len(week_cards),
        "top_cards": top[:5],
        "throughline": throughline,
    }

