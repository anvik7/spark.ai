"""AI Interview Simulator — a multi-round mock hiring process.

Three realistic rounds (HR screen, technical deep-dive, hiring manager), each
conducted conversationally: the candidate answers one question at a time and
gets feedback, then a final scorecard. Tuned to a target role/company and any
pasted context (job description, company blurb).

Stateless: the client holds the transcript and sends it each turn, so no
session storage is needed. Self-contained LLM dispatch with an offline question
bank, so it always works.
"""
import json
import random

import httpx

from .config import get_settings

settings = get_settings()

ROUNDS = ["HR Screen", "Technical Deep-Dive", "Hiring Manager"]

_PERSONA = {
    "HR Screen": ("Sarah Chen", "HR Lead", "warm but probing"),
    "Technical Deep-Dive": ("Arjun Mehta", "Senior Engineer", "rigorous, tests depth"),
    "Hiring Manager": ("Priya Nair", "Hiring Manager", "pragmatic, probes ownership"),
}

_FALLBACK_Q = {
    "HR Screen": [
        "Walk me through your background and why this role caught your eye.",
        "Tell me about a time you had to learn something hard, fast. How did you do it?",
        "Where do you want to be in three years, and how does this role fit?",
    ],
    "Technical Deep-Dive": [
        "Describe a system you built end to end. What were the hardest trade-offs?",
        "How would you design a service that handles 10x its current traffic overnight?",
        "Curveball: your production database is at 95% CPU right now. What do you do first?",
    ],
    "Hiring Manager": [
        "Tell me about a project you owned from idea to launch.",
        "Describe a decision you made that turned out to be wrong. What happened?",
        "Stress test: a teammate ships a bug that breaks your feature the day before a demo. Go.",
    ],
}


def _llm(prompt: str, max_tokens: int = 500) -> str:
    p = settings.llm_provider
    if p == "groq" and settings.groq_api_key:
        r = httpx.post("https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json={"model": settings.llm_model or "llama-3.3-70b-versatile",
                  "messages": [{"role": "user", "content": prompt}]}, timeout=45)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    if p == "gemini" and settings.gemini_api_key:
        model = settings.llm_model or "gemini-2.0-flash"
        r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/"
                       f"{model}:generateContent?key={settings.gemini_api_key}",
                       json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=45)
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    if p == "anthropic" and settings.anthropic_api_key:
        r = httpx.post("https://api.anthropic.com/v1/messages",
            headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01"},
            json={"model": settings.llm_model or "claude-haiku-4-5-20251001",
                  "max_tokens": max_tokens,
                  "messages": [{"role": "user", "content": prompt}]}, timeout=45)
        r.raise_for_status()
        return r.json()["content"][0]["text"].strip()
    raise RuntimeError("no LLM provider configured")


def _json(text: str, opener="{", closer="}"):
    s, e = text.find(opener), text.rfind(closer)
    if s == -1 or e == -1 or e < s:
        return None
    try:
        return json.loads(text[s:e + 1])
    except Exception:
        return None


def _ctx(role: str, company: str, context: str) -> str:
    parts = [f"Target role: {role or 'Software Engineer'}."]
    if company:
        parts.append(f"Company: {company}.")
    if context:
        parts.append(f"Role/company context: {context[:1500]}")
    return " ".join(parts)


def next_turn(role: str, company: str, context: str,
              round_name: str, history: list[dict]) -> dict:
    """history: [{q, a}, ...] for THIS round. Returns {feedback, question}."""
    p_info = _PERSONA.get(round_name, ("Alex", "Interviewer", "an experienced professional"))
    name, title, behavior = p_info
    persona_desc = f"{name}, the {title} — {behavior}"
    convo = "\n".join(f"Q: {h.get('q','')}\nCandidate: {h.get('a','')}"
                      for h in history if h.get("a"))
    prompt = (
        f"You are {persona_desc}, running the '{round_name}' round of a real interview. "
        f"{_ctx(role, company, context)}\nConversation so far:\n{convo or '(none yet)'}\n\n"
        "Return STRICT JSON with keys: \"feedback\" (1-2 sentences critiquing the "
        "candidate's LAST answer — specific, honest, kind; empty string if they "
        "haven't answered yet), \"question\" (your next question — ONE question, "
        "realistic, specific, progressively harder), and \"tips\" (array of exactly 3 "
        "short coaching strings for answering that specific question). Stay in character for the round."
    )
    asked = len([h for h in history if h.get("a")])
    try:
        obj = _json(_llm(prompt))
        if obj and obj.get("question"):
            return {"feedback": (obj.get("feedback") or "").strip(),
                    "question": obj["question"].strip(),
                    "tips": obj.get("tips", []),
                    "interviewer_name": name,
                    "interviewer_title": title}
    except Exception as e:
        print(f"[interview] LLM unavailable, using question bank: {e}")
    bank = _FALLBACK_Q.get(round_name, _FALLBACK_Q["HR Screen"])
    return {
        "feedback": "" if asked == 0 else "Solid — try to anchor your answer in a"
                    " concrete example with a measurable outcome.",
        "question": bank[min(asked, len(bank) - 1)],
        "tips": ["Use the STAR method", "Keep it under 2 minutes", "Quantify your impact"],
        "interviewer_name": name,
        "interviewer_title": title
    }


def scorecard(role: str, company: str, transcript: list[dict]) -> dict:
    """transcript: [{round, q, a}, ...] across all rounds."""
    convo = "\n".join(f"[{h.get('round','')}] Q: {h.get('q','')}\nA: {h.get('a','')}"
                      for h in transcript if h.get("a"))
    prompt = (
        f"You are the hiring panel for a {role or 'Software Engineer'} role"
        f"{(' at ' + company) if company else ''}. Here is the full interview:\n"
        f"{convo}\n\nReturn STRICT JSON: \"overall\" (integer 0-100 readiness), "
        "\"strengths\" (array of <=3 short strings), \"improvements\" (array of "
        "<=3 short, actionable strings), \"verdict\" (<=25 words: would you advance "
        "this candidate, and the single thing to fix first)."
    )
    try:
        obj = _json(_llm(prompt))
        if obj and "overall" in obj:
            try:
                obj["overall"] = max(0, min(100, int(obj["overall"])))
            except Exception:
                obj["overall"] = 60
            return obj
    except Exception as e:
        print(f"[interview] scorecard LLM unavailable, using fallback: {e}")
    answered = len([h for h in transcript if h.get("a")])
    return {
        "overall": min(95, 40 + answered * 6),
        "strengths": ["Completed all rounds", "Engaged with hard questions"],
        "improvements": ["Add metrics to your examples",
                         "Tighten answers to 60-90 seconds",
                         "Add a Groq/Gemini key for AI-graded feedback"],
        "verdict": "Promising — practice quantifying impact before the real thing.",
    }
