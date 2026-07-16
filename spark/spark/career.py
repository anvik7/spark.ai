"""Career Intelligence Engine (deep).

Signal in: public GitHub repos + pasted resume. Scored against market demand,
where demand is pulled **live from Adzuna job postings** when ADZUNA keys are
set, otherwise a curated seed table. Plus an LLM-written resume audit.

    gap_score = demand * (1 - proficiency)

Self-contained: it does its own LLM dispatch (groq/gemini/anthropic) with an
offline template fallback, so it doesn't depend on other modules. Replace your
existing career.py with this; the /api/career/audit route and signature
(`audit(github_username, resume_text)`) are unchanged.
"""
import json
import re
from collections import defaultdict

import httpx

from .config import get_settings

settings = get_settings()
_WORD = re.compile(r"[a-z0-9+#./-]+")

# skill -> (seed_demand 0..1, [aliases]). Demand is replaced by live data when available.
DEMAND: dict[str, tuple[float, list[str]]] = {
    "Python":        (0.90, ["python", "py", "fastapi", "django", "flask"]),
    "JavaScript":    (0.85, ["javascript", "js", "es6"]),
    "TypeScript":    (0.80, ["typescript", "ts"]),
    "React":         (0.90, ["react", "reactjs", "jsx", "next", "nextjs"]),
    "Node.js":       (0.75, ["node", "nodejs", "express", "nestjs"]),
    "SQL / Postgres":(0.85, ["sql", "postgres", "postgresql", "mysql", "sqlite"]),
    "Docker":        (0.80, ["docker", "dockerfile", "container", "compose"]),
    "AWS / Cloud":   (0.85, ["aws", "ec2", "s3", "lambda", "gcp", "azure", "cloud"]),
    "CI/CD":         (0.70, ["ci", "cd", "ci/cd", "github-actions", "jenkins", "pipeline"]),
    "Testing":       (0.70, ["test", "testing", "pytest", "jest", "unittest", "vitest"]),
    "Redis / Cache": (0.55, ["redis", "cache", "memcached"]),
    "Kubernetes":    (0.60, ["kubernetes", "k8s", "helm"]),
    "AI / LLMs":     (0.85, ["ai", "ml", "llm", "openai", "langchain", "embedding", "pytorch"]),
    "System Design": (0.70, ["microservice", "scalable", "architecture", "distributed", "kafka"]),
    "REST / APIs":   (0.70, ["api", "rest", "restful", "graphql", "grpc"]),
    "Git":           (0.65, ["git", "github", "gitlab"]),
    "Tailwind / UI": (0.50, ["tailwind", "css", "shadcn", "frontend"]),
    "Supabase":      (0.50, ["supabase", "firebase"]),
}

_GH_API = "https://api.github.com"


# --- self-contained LLM dispatch (offline-safe) -----------------------------

def _llm(prompt: str, max_tokens: int = 600) -> str:
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


def _json_block(text: str, opener="[", closer="]"):
    s, e = text.find(opener), text.rfind(closer)
    if s == -1 or e == -1 or e < s:
        return None
    try:
        return json.loads(text[s:e + 1])
    except Exception:
        return None


# --- live market demand (Adzuna) --------------------------------------------

def _adzuna_demand(country: str = "in", role: str = "software developer") -> dict | None:
    """Return {skill: demand 0..1} derived from live postings, or None."""
    if not (settings.adzuna_app_id and settings.adzuna_app_key):
        return None
    try:
        r = httpx.get(f"https://api.adzuna.com/v1/api/jobs/{country}/search/1",
                      params={"app_id": settings.adzuna_app_id,
                              "app_key": settings.adzuna_app_key,
                              "results_per_page": 50, "what": role,
                              "content-type": "application/json"}, timeout=25)
        r.raise_for_status()
        results = r.json().get("results", [])
    except Exception as e:
        print(f"[adzuna] failed, using seed demand: {e}")
        return None
    if not results:
        return None
    corpus = [_WORD.findall((j.get("description", "") + " " + j.get("title", "")).lower())
              for j in results]
    total = len(corpus)
    demand = {}
    for skill, (_, aliases) in DEMAND.items():
        hits = sum(1 for toks in corpus if set(toks) & set(aliases))
        demand[skill] = round(min(1.0, hits / total + 0.05), 2)  # +floor so nothing is 0
    return demand


# --- candidate signal -------------------------------------------------------

def _github_signal(username: str):
    prof, repos = defaultdict(float), []
    try:
        r = httpx.get(f"{_GH_API}/users/{username}/repos",
                      params={"per_page": 100, "sort": "pushed", "type": "owner"},
                      headers={"Accept": "application/vnd.github+json",
                               "User-Agent": "Spark-Career/1.0"}, timeout=20)
        if r.status_code == 404:
            return {}, [], f"GitHub user '{username}' not found."
        if r.status_code == 403:
            return {}, [], "GitHub rate limit hit — try again shortly."
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        return {}, [], f"Could not reach GitHub: {e}"
    hits = defaultdict(float)
    for repo in data:
        if repo.get("fork"):
            continue
        repos.append(repo.get("name", ""))
        blob = " ".join(filter(None, [
            repo.get("language") or "",
            (repo.get("name") or "").replace("-", " ").replace("_", " "),
            repo.get("description") or "", " ".join(repo.get("topics") or []),
        ])).lower()
        tokens = set(_WORD.findall(blob))
        lang = (repo.get("language") or "").lower()
        for skill, (_, aliases) in DEMAND.items():
            if lang and lang in aliases:
                hits[skill] += 1.5
            elif tokens & set(aliases):
                hits[skill] += 1.0
    for skill, h in hits.items():
        prof[skill] = min(1.0, h / 3.0)
    note = f"Analysed {len(repos)} public repos." if repos else \
        f"'{username}' has no public original repos."
    return dict(prof), repos, note


def _resume_signal(text: str) -> dict[str, float]:
    if not text:
        return {}
    tokens = set(_WORD.findall(text.lower()))
    return {skill: 0.7 for skill, (_, aliases) in DEMAND.items()
            if tokens & set(aliases)}


def _resume_audit(resume_text: str) -> dict | None:
    if not resume_text.strip():
        return None
    prompt = (
        "You are a senior tech recruiter. Audit this resume. Return STRICT JSON "
        'with keys: "summary" (<=20 words), "strengths" (array of <=4 short '
        'strings), "weaknesses" (array of <=4), "ats_issues" (array of <=3 '
        'formatting/keyword problems an applicant-tracking system would flag), '
        '"fixes" (array of <=4 concrete rewrite suggestions). Resume:\n\n'
        + resume_text[:6000])
    try:
        obj = _json_block(_llm(prompt), "{", "}")
        if obj:
            return obj
    except Exception as e:
        print(f"[resume_audit] LLM failed, using fallback: {e}")
    return {"summary": "Add a Groq/Gemini/Anthropic key for a full AI resume audit.",
            "strengths": [], "weaknesses": [], "ats_issues": [], "fixes": []}


def _learning_plan(gaps: list[dict]) -> list[dict]:
    if not gaps:
        return []
    names = ", ".join(g["skill"] for g in gaps)
    prompt = (f"A developer needs to close these skill gaps: {names}. Return STRICT "
              'JSON array, one object per skill, keys "skill","why" (<=14 words),'
              '"plan" (<=22 words, a ~3-hour path),"project" (<=10 words).')
    try:
        arr = _json_block(_llm(prompt))
        if arr:
            return arr
    except Exception as e:
        print(f"[learning_plan] LLM failed, using template: {e}")
    return [{"skill": g["skill"],
             "why": f"High demand ({int(g['demand']*100)}%) and a current gap.",
             "plan": f"Spend ~3 hours on a focused {g['skill']} tutorial, then apply it.",
             "project": f"Add {g['skill']} to a small project."} for g in gaps]


# --- main entry -------------------------------------------------------------

def audit(github_username: str = "", resume_text: str = "", pro: bool = False) -> dict:
    notes, prof = [], defaultdict(float)
    if github_username:
        gh_prof, _, gh_note = _github_signal(github_username)
        notes.append(gh_note)
        for s, p in gh_prof.items():
            prof[s] = max(prof[s], p)
    if resume_text:
        for s, p in _resume_signal(resume_text).items():
            prof[s] = max(prof[s], p)
        notes.append("Included resume keywords.")

    live = _adzuna_demand()
    demand_of = (lambda s: live[s]) if live else (lambda s: DEMAND[s][0])
    demand_source = "live job postings (Adzuna)" if live else "curated seed table"

    rows = []
    for skill in DEMAND:
        p = round(prof.get(skill, 0.0), 2)
        d = round(demand_of(skill), 2)
        rows.append({"skill": skill, "demand": d, "proficiency": p,
                     "gap_score": round(d * (1 - p), 3)})

    total = sum(r["demand"] for r in rows) or 1
    readiness = round(100 * sum(r["demand"] * r["proficiency"] for r in rows) / total)
    strengths = sorted([r for r in rows if r["proficiency"] >= 0.6],
                       key=lambda r: -r["demand"])[:6]
    gaps = sorted([r for r in rows if r["proficiency"] < 0.6],
                  key=lambda r: -r["gap_score"])[:6]

    return {
        "readiness": readiness,
        "note": " ".join(notes) or "No sources provided.",
        "demand_source": demand_source,
        "pro": pro,
        "strengths": strengths,
        "gaps": gaps,
        "plan": _learning_plan(gaps) if pro else [],
        "resume_audit": _resume_audit(resume_text) if pro else None,
        "locked": [] if pro else ["plan", "resume_audit"],
    }
