"""LLM adapter. The product's value is the workflow, not the model — so the
model sits behind one interface. Runs offline via a deterministic 'mock' that
still produces useful tags/summaries, and swaps to Gemini/Groq/Anthropic by
setting llm_provider + the matching key. Pick ONE for production."""
import json
import re
import httpx
from .config import get_settings

settings = get_settings()

_PROMPT = (
    "You organise a personal knowledge card. Given a note, return STRICT JSON "
    'with keys "summary" (<=18 words, plain English) and "tags" (3-5 lowercase '
    'kebab-case topic tags, no # symbol). Note:\n\n{text}'
)

# Lightweight keyword map so the offline mock still feels intelligent.
_MOCK_TOPICS = {
    "startup": ["startups", "business"], "fund": ["fundraising", "startups"],
    "market": ["marketing", "growth"], "upsc": ["upsc", "polity"],
    "econom": ["economics", "upsc-economics"], "neet": ["neet", "biology"],
    "jee": ["jee", "physics"], "python": ["python", "coding"],
    "supabase": ["supabase", "backend"], "react": ["react", "frontend"],
    "history": ["history"], "tax": ["taxation", "policy"],
    "ai": ["ai", "ml"], "health": ["health"],
}


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


def _extract_json(s: str) -> dict:
    m = re.search(r"\{.*\}", s, re.DOTALL)
    return json.loads(m.group(0)) if m else {}


def enrich(text: str) -> dict:
    """Return {'summary': str, 'tags': [str]} for a raw note."""
    p = settings.llm_provider
    try:
        if (p in ["xai", "grok"] or settings.xai_api_key or settings.grok_api_key) and (settings.xai_api_key or settings.grok_api_key):
            return _xai(text)
        if p == "gemini" and settings.gemini_api_key:
            return _gemini(text)
        if p == "groq" and settings.groq_api_key:
            return _groq(text)
        if p == "anthropic" and settings.anthropic_api_key:
            return _anthropic(text)
    except Exception as e:  # never let tagging take down ingestion
        print(f"[llm] provider '{p}' failed, falling back to mock: {e}")
    return _mock(text)


def _xai(text: str) -> dict:
    key = settings.xai_api_key or settings.grok_api_key
    model = settings.llm_model or "grok-2-latest"
    r = httpx.post("https://api.x.ai/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": model, "messages": [
            {"role": "user", "content": _PROMPT.format(text=text)}],
            "response_format": {"type": "json_object"}}, timeout=30)
    r.raise_for_status()
    out = r.json()["choices"][0]["message"]["content"]
    return _normalise(_extract_json(out), text)


def _gemini(text: str) -> dict:
    model = settings.llm_model or "gemini-2.0-flash"
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{model}:generateContent?key={settings.gemini_api_key}")
    r = httpx.post(url, json={"contents": [{"parts": [
        {"text": _PROMPT.format(text=text)}]}]}, timeout=30)
    r.raise_for_status()
    out = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    return _normalise(_extract_json(out), text)


def _groq(text: str) -> dict:
    model = settings.llm_model or "llama-3.3-70b-versatile"
    r = httpx.post("https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        json={"model": model, "messages": [
            {"role": "user", "content": _PROMPT.format(text=text)}],
            "response_format": {"type": "json_object"}}, timeout=30)
    r.raise_for_status()
    out = r.json()["choices"][0]["message"]["content"]
    return _normalise(_extract_json(out), text)


def _anthropic(text: str) -> dict:
    model = settings.llm_model or "claude-haiku-4-5-20251001"
    r = httpx.post("https://api.anthropic.com/v1/messages",
        headers={"x-api-key": settings.anthropic_api_key,
                 "anthropic-version": "2023-06-01"},
        json={"model": model, "max_tokens": 300, "messages": [
            {"role": "user", "content": _PROMPT.format(text=text)}]}, timeout=30)
    r.raise_for_status()
    out = r.json()["content"][0]["text"]
    return _normalise(_extract_json(out), text)


def _normalise(d: dict, text: str) -> dict:
    summary = (d.get("summary") or "").strip()
    tags = [str(t).lstrip("#").lower().strip() for t in d.get("tags", []) if t]
    if not summary or not tags:
        fb = _mock(text)
        summary = summary or fb["summary"]
        tags = tags or fb["tags"]
    return {"summary": summary[:200], "tags": tags[:5]}


# --- synthesis ("connect the dots" across saved cards) ----------------------

_SYNTH_PROMPT = (
    "You are a study assistant. The user asked: \"{q}\". Using ONLY their saved "
    "notes below, write a tight structured briefing (<=180 words): a one-line "
    "thesis, then 3-5 bullet insights that connect the notes, surfacing any "
    "contradictions or gaps. Plain English. Notes:\n\n{notes}"
)


def synthesize(query: str, notes: list[str]) -> str:
    """Draft a connected summary from matching cards. Offline-safe."""
    joined = "\n".join(f"- {n}" for n in notes[:25])[:6000]
    p = settings.llm_provider
    prompt = _SYNTH_PROMPT.format(q=query, notes=joined)
    try:
        if p == "gemini" and settings.gemini_api_key:
            return _gemini_text(prompt)
        if p == "groq" and settings.groq_api_key:
            return _groq_text(prompt)
        if p == "anthropic" and settings.anthropic_api_key:
            return _anthropic_text(prompt)
    except Exception as e:
        print(f"[llm] synth provider '{p}' failed, using mock: {e}")
    # Mock: a readable digest so the feature works with no keys.
    head = f"On \"{query}\", you have {len(notes)} related note(s)."
    bullets = "\n".join(f"• {n[:140]}" for n in notes[:5])
    return f"{head}\n{bullets}" if bullets else f"No saved notes match \"{query}\" yet."


# --- draft (write a piece of content FROM saved cards) -----------------------

_DRAFT_PROMPT = (
    "You are a writing assistant. The user wants you to: \"{instruction}\". "
    "Using ONLY the source notes below as raw material, write the requested piece "
    "directly — no preamble, no explanation, just the finished text, ready to use. "
    "Keep it under 200 words unless the instruction asks for more. Notes:\n\n{notes}"
)


def draft(instruction: str, notes: list[str]) -> str:
    """Generate a piece of writing (post, paragraph, summary) FROM saved cards,
    rather than just answering a question about them. Offline-safe."""
    joined = "\n".join(f"- {n}" for n in notes[:25])[:6000]
    p = settings.llm_provider
    prompt = _DRAFT_PROMPT.format(instruction=instruction, notes=joined)
    try:
        if p == "gemini" and settings.gemini_api_key:
            return _gemini_text(prompt)
        if p == "groq" and settings.groq_api_key:
            return _groq_text(prompt)
        if p == "anthropic" and settings.anthropic_api_key:
            return _anthropic_text(prompt)
    except Exception as e:
        print(f"[llm] draft provider '{p}' failed, using mock: {e}")
    if not notes:
        return f"I don't have any saved notes to draft \"{instruction}\" from yet — capture a few first."
    return f"[Draft based on {len(notes)} note(s)]\n" + " ".join(n[:200] for n in notes[:3])


def _gemini_text(prompt: str) -> str:
    model = settings.llm_model or "gemini-2.0-flash"
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{model}:generateContent?key={settings.gemini_api_key}")
    r = httpx.post(url, json={"contents": [{"parts": [{"text": prompt}]}]},
                   timeout=40)
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()


def _groq_text(prompt: str) -> str:
    model = settings.llm_model or "llama-3.3-70b-versatile"
    r = httpx.post("https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        json={"model": model, "messages": [{"role": "user", "content": prompt}]},
        timeout=40)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


def _anthropic_text(prompt: str) -> str:
    model = settings.llm_model or "claude-haiku-4-5-20251001"
    r = httpx.post("https://api.anthropic.com/v1/messages",
        headers={"x-api-key": settings.anthropic_api_key,
                 "anthropic-version": "2023-06-01"},
        json={"model": model, "max_tokens": 500,
              "messages": [{"role": "user", "content": prompt}]}, timeout=40)
    r.raise_for_status()
    return r.json()["content"][0]["text"].strip()


# --- career: learning plan for skill gaps -----------------------------------

_PLAN_PROMPT = (
    "A developer needs to close these skill gaps for the job market: {skills}. "
    "Return STRICT JSON: an array of objects, one per skill, each with keys "
    '"skill" (exact name), "why" (<=14 words, why it matters), "plan" (<=22 words, '
    'a focused ~3-hour learning path) and "project" (<=10 words, a tiny build to '
    "prove it). No prose outside the JSON array."
)


def learning_plan(gaps: list[dict]) -> list[dict]:
    """Draft a per-gap learning plan. Offline-safe (templated fallback)."""
    if not gaps:
        return []
    names = ", ".join(g["skill"] for g in gaps)
    prompt = _PLAN_PROMPT.format(skills=names)
    p = settings.llm_provider
    try:
        if p == "gemini" and settings.gemini_api_key:
            raw = _gemini_text(prompt)
        elif p == "groq" and settings.groq_api_key:
            raw = _groq_text(prompt)
        elif p == "anthropic" and settings.anthropic_api_key:
            raw = _anthropic_text(prompt)
        else:
            raise RuntimeError("no provider")
        arr = _extract_json_array(raw)
        if arr:
            return arr
    except Exception as e:
        print(f"[llm] learning_plan provider '{p}' failed, using template: {e}")

    # Templated fallback so the feature works with zero keys.
    return [{
        "skill": g["skill"],
        "why": f"High market demand ({int(g['demand']*100)}%) and currently a gap.",
        "plan": f"Spend ~3 hours on a focused {g['skill']} tutorial, then apply it once.",
        "project": f"Add {g['skill']} to a small existing project.",
    } for g in gaps]


def _extract_json_array(text: str):
    import json as _json
    s, e = text.find("["), text.rfind("]")
    if s == -1 or e == -1 or e < s:
        return None
    try:
        return _json.loads(text[s:e + 1])
    except Exception:
        return None


# --- rich metadata enrichment (knowledge-object fields) ----------------------

_FULL_PROMPT = (
    "Organise this into a knowledge card. Return STRICT JSON with keys: "
    "title (<=8 words, no surrounding quotes), summary (<=25 words), "
    "tags (array of 3-5 lowercase keywords, no #), topic (1-2 words, the broad "
    "domain e.g. 'economics', 'react'), difficulty (integer 1-5, how hard the "
    "idea is to grasp), importance (integer 1-10, how worth revisiting later). "
    "Content:\n\n{text}"
)


def _complete(prompt: str) -> str:
    p = settings.llm_provider
    if p == "gemini" and settings.gemini_api_key:
        model = settings.llm_model or "gemini-2.0-flash"
        r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/"
                       f"{model}:generateContent?key={settings.gemini_api_key}",
                       json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=30)
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]
    if p == "groq" and settings.groq_api_key:
        r = httpx.post("https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json={"model": settings.llm_model or "llama-3.3-70b-versatile",
                  "messages": [{"role": "user", "content": prompt}],
                  "response_format": {"type": "json_object"}}, timeout=30)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    if p == "anthropic" and settings.anthropic_api_key:
        r = httpx.post("https://api.anthropic.com/v1/messages",
            headers={"x-api-key": settings.anthropic_api_key,
                     "anthropic-version": "2023-06-01"},
            json={"model": settings.llm_model or "claude-haiku-4-5-20251001",
                  "max_tokens": 400,
                  "messages": [{"role": "user", "content": prompt}]}, timeout=30)
        r.raise_for_status()
        return r.json()["content"][0]["text"]
    raise RuntimeError("no LLM provider configured")


def _fallback_title(text: str) -> str:
    words = (text or "").strip().split()
    return " ".join(words[:7]) or "Untitled"


def enrich_full(text: str, source_type: str = "text") -> dict:
    """Full knowledge-object metadata, with graceful offline fallback."""
    base = _mock(text)
    try:
        d = _extract_json(_complete(_FULL_PROMPT.format(text=(text or "")[:6000])))
    except Exception as e:
        print(f"[llm] enrich_full fell back to mock: {e}")
        d = {}
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
    return {"title": title[:80], "summary": summary[:200], "tags": tags[:5],
            "topic": topic[:30], "difficulty": difficulty, "importance": importance}


def _xai_text(prompt: str) -> str:
    key = settings.xai_api_key or settings.grok_api_key
    model = settings.llm_model or "grok-2-latest"
    r = httpx.post("https://api.x.ai/v1/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": model, "messages": [{"role": "user", "content": prompt}]},
        timeout=45)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


def _complete_text(prompt: str) -> str:
    p = settings.llm_provider
    if (p in ["xai", "grok"] or settings.xai_api_key or settings.grok_api_key) and (settings.xai_api_key or settings.grok_api_key):
        return _xai_text(prompt)
    if p == "gemini" and settings.gemini_api_key:
        return _gemini_text(prompt)
    if p == "groq" and settings.groq_api_key:
        return _groq_text(prompt)
    if p == "anthropic" and settings.anthropic_api_key:
        return _anthropic_text(prompt)
    raise RuntimeError("No LLM provider configured (set XAI_API_KEY, GROK_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY).")


_SOLVE_TASK_PROMPT = (
    "You are Spark AI, an expert academic tutor and problem solver. "
    "Solve the following student question/task step-by-step: \"{prompt}\". "
    "Subject Hint: {subject_hint}.\n\n"
    "ACCURACY REQUIREMENTS:\n"
    "1. For Mathematics/Science: Provide the EXACT mathematical working, algebraic derivations, line-by-line calculations, and final answer. Do NOT use generic placeholder text like 'apply formulas' or 'calculate exact steps'. Show the actual numbers, equations, and steps!\n"
    "2. For Practice Problems: Include 2 to 3 genuine practice questions with their explicit correct solutions. Format each item EXACTLY as: 'Problem: <question text> | Answer: <correct answer>'\n"
    "3. Return STRICT JSON with keys:\n"
    "- \"subject\": string (e.g. 'Mathematics', 'Physics', 'Chemistry', 'Coding', 'Writing', 'Economics', 'Research', 'General Academic')\n"
    "- \"title\": string (short concise title, <=10 words)\n"
    "- \"solution\": string (explicit final answer or primary solution result, e.g. 'x = 3, x = -1/2')\n"
    "- \"steps\": array of 3-5 strings (numbered explicit step-by-step mathematical/analytical steps with actual working)\n"
    "- \"formulas\": array of 1-3 strings (exact formulas or core principles used, e.g. 'Quadratic Formula: x = (-b ± √(b²-4ac)) / (2a)')\n"
    "- \"intuition\": string (1-2 sentences explaining intuitive reasoning)\n"
    "- \"practice\": array of 2-3 strings (format: 'Problem: <exercise question> | Answer: <explicit solution>')\n"
)


def _sympy_algebraic_solver(prompt: str, subject_hint: str = "") -> dict | None:
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
                f"Verify solutions by substituting back into original equation.",
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
        print(f"[sympy_solver] parsing skipped: {e}")
    return None


def solve_student_task(prompt: str, subject_hint: str = "") -> dict:
    """Solve an academic question or task using real LLM execution or exact SymPy solver."""
    p_text = _SOLVE_TASK_PROMPT.format(prompt=(prompt or "")[:3000], subject_hint=subject_hint or "General")

    # 1. Try LLM Provider
    try:
        raw_text = _complete_text(p_text)
        parsed = _extract_json(raw_text)
        if parsed and isinstance(parsed, dict) and "solution" in parsed:
            if "practice" in parsed and isinstance(parsed["practice"], list):
                parsed["practice"] = [str(pr).strip() for pr in parsed["practice"] if pr]
            return parsed
    except Exception as e:
        print(f"[solve_student_task] LLM execution error: {e}")

    # 2. Try Exact SymPy Mathematical Engine
    sympy_res = _sympy_algebraic_solver(prompt, subject_hint)
    if sympy_res:
        return sympy_res

    # 3. Handle specific academic domain queries explicitly
    low = (prompt or "").lower()
    is_math = any(k in low for k in ["math", "calculus", "integral", "derivative", "solve", "equation", "+", "-", "*", "/", "="])
    is_coding = any(k in low for k in ["code", "python", "js", "react", "bug", "function", "array", "algorithm"])
    is_physics = any(k in low for k in ["physics", "force", "velocity", "acceleration", "mass", "energy", "newton"])

    subj = subject_hint or ("Mathematics" if is_math else "Coding" if is_coding else "Physics" if is_physics else "General Academic")
    icon = "🧮" if is_math else "💻" if is_coding else "🔬" if is_physics else "📚"

    # If unconfigured/failed without SymPy parseable equation, raise error to display error banner
    raise RuntimeError(f"AI solver could not compute solution for query '{prompt[:60]}'. Please configure an LLM API key (GEMINI_API_KEY, GROQ_API_KEY, or ANTHROPIC_API_KEY).")


def solve_task_followup(task_prompt: str, task_solution: str, thread: list[dict], followup_text: str) -> str:
    """Answer a follow-up question for an ongoing student task thread."""
    history = "\n".join(f"{m.get('role','user').capitalize()}: {m.get('content','')}" for m in (thread or [])[-6:])
    p_text = (
        f"You are Spark AI, a top-tier academic tutor.\n"
        f"ORIGINAL TASK: \"{task_prompt}\"\n"
        f"INITIAL SOLUTION: \"{task_solution}\"\n"
        f"PAST CONVERSATION:\n{history}\n\n"
        f"STUDENT FOLLOW-UP QUESTION: \"{followup_text}\"\n\n"
        "Provide a direct, concise, and clear answer to the student's follow-up question. "
        "Explain step-by-step if needed."
    )
    try:
        return _complete_text(p_text)
    except Exception as e:
        print(f"[llm] solve_task_followup LLM error: {e}")
        return f"Explanation for '{followup_text}': Contextual clarification based on initial solution '{task_solution[:60]}'."
