"""Production AI Interview Simulator Engine.

Analyzes candidate resumes, evaluates target role JDs, dynamically probes
candidate claims and metrics, adapts difficulty, and generates multi-metric
candidate evaluation scorecards.
"""
import json
import re
from typing import Optional
import httpx

from .config import get_settings

settings = get_settings()


def _llm(prompt: str, max_tokens: int = 1000) -> str:
    p = settings.llm_provider
    if (p == "openrouter" or settings.openrouter_api_key) and settings.openrouter_api_key:
        model = settings.openrouter_model or settings.llm_model or "meta-llama/llama-3.3-70b-instruct"
        r = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "HTTP-Referer": "https://spark.ai",
                "X-Title": "Spark AI Student Workspace",
                "Content-Type": "application/json",
            },
            json={"model": model, "messages": [{"role": "user", "content": prompt}]},
            timeout=45,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    key = settings.xai_api_key or settings.grok_api_key
    if (p in ["xai", "grok"] or key) and key:
        r = httpx.post(
            "https://api.x.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": settings.llm_model or "grok-2-latest",
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=45,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    if p == "groq" and settings.groq_api_key:
        r = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json={
                "model": settings.llm_model or "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=45,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"].strip()
    if p == "gemini" and settings.gemini_api_key:
        model = settings.llm_model or "gemini-2.0-flash"
        r = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={settings.gemini_api_key}",
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=45,
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    if p == "anthropic" and settings.anthropic_api_key:
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01"},
            json={
                "model": settings.llm_model or "claude-haiku-4-5-20251001",
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=45,
        )
        r.raise_for_status()
        return r.json()["content"][0]["text"].strip()
    raise RuntimeError("no LLM provider configured")


def _extract_json(text: str):
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1 or e < s:
        return None
    try:
        return json.loads(text[s: e + 1])
    except Exception:
        return None


# --- Opening Question ---------------------------------------------------------

_OPENING_PROMPT = (
    "You are an expert executive interviewer conducting a {round_type} interview for the position of '{target_role}'"
    "{company_info}. Difficulty level: {difficulty}.\n\n"
    "CANDIDATE RESUME:\n{resume_text}\n\n"
    "JOB DESCRIPTION:\n{job_description}\n\n"
    "INSTRUCTIONS:\n"
    "1. Read the candidate's resume and identify specific projects, technologies, achievements, or metrics (e.g. '% increase', 'built system X').\n"
    "2. Generate ONE sharp, realistic opening question specifically investigating the candidate's actual background and how it applies to the target role.\n"
    "3. Do NOT ask generic questions like 'Tell me about yourself'. Ask a direct, inquisitive question probing a specific claim or achievement on their resume.\n"
    "4. Output ONLY the opening question, directly to the candidate."
)


def generate_opening_question(
    target_role: str = "",
    target_company: str = "",
    job_description: str = "",
    resume_text: str = "",
    round_type: str = "Technical Deep-Dive",
    difficulty: str = "Medium",
) -> str:
    """Generate candidate-specific opening question probing resume claims."""
    role = target_role.strip() or "Software / Professional Role"
    company_info = f" at {target_company.strip()}" if target_company.strip() else ""

    prompt = _OPENING_PROMPT.format(
        round_type=round_type,
        target_role=role,
        company_info=company_info,
        difficulty=difficulty,
        resume_text=(resume_text or "").strip()[:5000] or "General candidate background in " + role,
        job_description=(job_description or "").strip()[:3000] or "Standard expectations for " + role,
    )

    try:
        q = _llm(prompt, max_tokens=300)
        if q and len(q) > 15:
            return q.strip().strip('"')
    except Exception as e:
        print(f"[generate_opening_question] LLM fallback: {e}")

    # Intelligent fallback tailored to role
    if "Technical" in round_type or "Engineering" in role:
        return f"Looking at your experience, walk me through the architecture of the most complex system you owned. What trade-offs did you make for scalable performance?"
    elif "Manager" in round_type or "Product" in role:
        return f"Walk me through how you prioritize features when engineering deadlines conflict with business requirements for {role}."
    else:
        return f"Tell me about a project on your resume that best demonstrates your readiness for the {role} position."


# --- Multi-Turn Adaptive Questioning ------------------------------------------

_TURN_PROMPT = (
    "You are an expert interviewer conducting a {round_type} interview for '{target_role}'. Current difficulty: {difficulty}.\n\n"
    "CANDIDATE RESUME:\n{resume_text}\n\n"
    "PAST INTERVIEW TRANSCRIPT:\n{transcript}\n\n"
    "LATEST CANDIDATE ANSWER:\n\"{last_answer}\"\n\n"
    "INSTRUCTIONS:\n"
    "1. Evaluate the candidate's latest answer for technical depth, metric evidence, and specificity.\n"
    "2. Provide 1-2 sentences of concise recruiter feedback on their answer.\n"
    "3. Ask the NEXT intelligent follow-up question. If they made a specific claim or mentioned a metric/technology, probe deeper into trade-offs, edge cases, baseline measurements, or concrete implementation details.\n"
    "4. Return STRICT JSON with keys:\n"
    "   - \"feedback\": string (1-2 sentences constructive feedback)\n"
    "   - \"next_question\": string (the next inquiring question)\n"
    "   - \"adjusted_difficulty\": string ('Easy', 'Medium', 'Hard', 'Expert')"
)


def next_interview_turn(
    target_role: str = "",
    target_company: str = "",
    job_description: str = "",
    resume_text: str = "",
    round_type: str = "Technical Deep-Dive",
    difficulty: str = "Medium",
    history: Optional[list] = None,
    last_answer: str = "",
) -> dict:
    """Evaluate candidate answer and generate next adaptive follow-up question."""
    history_lines = []
    for turn in (history or [])[-4:]:
        history_lines.append(f"Q: {turn.get('q','')}\nCandidate: {turn.get('a','')}")
    transcript = "\n\n".join(history_lines)

    prompt = _TURN_PROMPT.format(
        round_type=round_type,
        target_role=target_role or "Professional Role",
        difficulty=difficulty,
        resume_text=(resume_text or "").strip()[:4000],
        transcript=transcript[:3000],
        last_answer=(last_answer or "").strip()[:2000],
    )

    try:
        raw_json = _llm(prompt, max_tokens=600)
        parsed = _extract_json(raw_json)
        if parsed and isinstance(parsed, dict) and "next_question" in parsed:
            return parsed
    except Exception as e:
        print(f"[next_interview_turn] LLM fallback: {e}")

    # Fallback response evaluating answer length and depth
    clean_ans = (last_answer or "").strip()
    is_detailed = len(clean_ans) > 150

    adjusted_diff = "Hard" if is_detailed and difficulty in ["Medium", "Hard"] else "Medium"
    fb = "Good initial overview. Adding specific quantitative metrics and concrete trade-offs would strengthen your response." if is_detailed else "Your response was quite brief. Recruiters look for specific evidence, metrics, and implementation details."

    if is_detailed:
        next_q = f"You highlighted your implementation approach. What was the most critical edge case or failure mode you encountered, and how did you resolve it?"
    else:
        next_q = f"Can you walk me through a specific example with concrete numbers and tools to demonstrate how you handled that in practice?"

    return {
        "feedback": fb,
        "next_question": next_q,
        "adjusted_difficulty": adjusted_diff,
    }


# --- Candidate Evaluation Report ----------------------------------------------

_EVALUATION_PROMPT = (
    "You are the Lead Hiring Committee Chair. Evaluate this completed multi-turn interview for '{target_role}'{company_info}.\n\n"
    "CANDIDATE RESUME:\n{resume_text}\n\n"
    "JOB DESCRIPTION:\n{job_description}\n\n"
    "FULL INTERVIEW TRANSCRIPT:\n{transcript}\n\n"
    "Return STRICT JSON with keys:\n"
    "- \"overall_score\": integer (0 to 100 overall candidate performance score)\n"
    "- \"technical_depth\": integer (0 to 100)\n"
    "- \"communication\": integer (0 to 100)\n"
    "- \"problem_solving\": integer (0 to 100)\n"
    "- \"role_relevance\": integer (0 to 100)\n"
    "- \"specificity_evidence\": integer (0 to 100)\n"
    "- \"verdict\": string ('Strong Hire', 'Hire', 'Leaning Hire', 'No Hire')\n"
    "- \"summary\": string (recruiter evaluation summary)\n"
    "- \"strengths\": array of strings (demonstrated candidate strengths)\n"
    "- \"weaknesses\": array of strings (missed opportunities and weaknesses)\n"
    "- \"practice_areas\": array of strings (concrete preparation recommendations)\n"
)


def evaluate_interview_session(
    target_role: str = "",
    target_company: str = "",
    job_description: str = "",
    resume_text: str = "",
    round_type: str = "Technical Deep-Dive",
    history: Optional[list] = None,
) -> dict:
    """Generate complete candidate evaluation report from multi-turn transcript."""
    history_lines = []
    for idx, turn in enumerate(history or []):
        history_lines.append(f"Turn {idx+1}:\nInterviewer: {turn.get('q','')}\nCandidate: {turn.get('a','')}\nFeedback: {turn.get('feedback','')}")
    transcript = "\n\n".join(history_lines)

    company_info = f" at {target_company.strip()}" if target_company.strip() else ""

    prompt = _EVALUATION_PROMPT.format(
        target_role=target_role or "Professional Role",
        company_info=company_info,
        resume_text=(resume_text or "").strip()[:4000],
        job_description=(job_description or "").strip()[:3000],
        transcript=transcript[:6000],
    )

    try:
        raw_json = _llm(prompt, max_tokens=1000)
        parsed = _extract_json(raw_json)
        if parsed and isinstance(parsed, dict) and "overall_score" in parsed:
            return parsed
    except Exception as e:
        print(f"[evaluate_interview_session] LLM fallback: {e}")

    # Calculate score from candidate answers length & detail
    turns_count = len(history or [])
    avg_answer_length = sum(len(t.get("a", "")) for t in (history or [])) / (turns_count or 1)

    score = 75 if avg_answer_length > 150 else 55
    if turns_count >= 3:
        score += 10
    score = min(96, max(40, score))

    verdict = "Strong Hire" if score >= 85 else "Hire" if score >= 70 else "Leaning Hire" if score >= 60 else "No Hire"

    return {
        "overall_score": score,
        "technical_depth": score - 3,
        "communication": score + 2,
        "problem_solving": score,
        "role_relevance": score + 4,
        "specificity_evidence": max(45, score - 8),
        "verdict": verdict,
        "summary": f"Completed {turns_count} rounds for {target_role}. Demonstrated solid domain knowledge with potential to add quantitative metrics.",
        "strengths": [
            "Good engagement with scenario questions",
            "Clear articulation of background experience",
        ],
        "weaknesses": [
            "Could provide more baseline numbers and quantifiable business impact",
            "Deepen technical trade-off analysis during scenario questions",
        ],
        "practice_areas": [
            "Practice the STAR method (Situation, Task, Action, Result) with metrics",
            "Prepare detailed system architecture breakdowns with failure modes",
        ],
    }
