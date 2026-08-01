"""Ingestion: turn whatever the user captures — a thought, link, photo, voice
note, PDF, or GitHub repo — into one clean knowledge card with rich metadata
(title, summary, tags, topic, difficulty, importance). AI enrichment uses the
same offline-capable adapter as everywhere else (spark.llm)."""
import base64
import io
import re
from html import unescape

import httpx

from . import llm
from .transcribe import transcribe

_URL_RE = re.compile(r"https?://[^\s]+")
_GH_RE = re.compile(r"github\.com/([\w.-]+)/([\w.-]+)")
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_GH_HEADERS = {"Accept": "application/vnd.github+json", "User-Agent": "Spark/1.0"}


def _strip_html(html: str) -> str:
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html,
                  flags=re.IGNORECASE | re.DOTALL)
    return _WS_RE.sub(" ", unescape(_TAG_RE.sub(" ", html))).strip()


def fetch_link(url: str) -> tuple[str, str]:
    """Return (title, readable_text) for an article URL. Never raises."""
    try:
        r = httpx.get(url, timeout=15, follow_redirects=True,
                      headers={"User-Agent": "Spark/1.0 (+notes)"})
        r.raise_for_status()
        m = _TITLE_RE.search(r.text)
        title = _WS_RE.sub(" ", unescape(m.group(1))).strip() if m else url
        return title, _strip_html(r.text)[:5000]
    except Exception as e:
        return url, f"[could not fetch link: {e}]"


def fetch_github(url: str) -> tuple[str, str]:
    """Return (title, summary_text) for a GitHub repo via the public API."""
    m = _GH_RE.search(url)
    if not m:
        return url, "[not a recognisable GitHub repo URL]"
    owner, repo = m.group(1), m.group(2).replace(".git", "")
    try:
        meta_r = httpx.get(f"https://api.github.com/repos/{owner}/{repo}",
                           headers=_GH_HEADERS, timeout=20)
        if meta_r.status_code == 403:
            return url, "[GitHub rate limit hit — try again in a few minutes]"
        if meta_r.status_code == 404:
            return url, f"[repo {owner}/{repo} not found]"
        meta_r.raise_for_status()
        meta = meta_r.json()
        langs = httpx.get(f"https://api.github.com/repos/{owner}/{repo}/languages",
                          headers=_GH_HEADERS, timeout=20).json()
        readme = ""
        rr = httpx.get(f"https://api.github.com/repos/{owner}/{repo}/readme",
                       headers=_GH_HEADERS, timeout=20)
        if rr.status_code == 200:
            raw = base64.b64decode(rr.json().get("content", "")).decode("utf-8", "ignore")
            readme = _WS_RE.sub(" ", re.sub(r"[#*`>_\-]{1,}", " ", raw)).strip()[:4000]
        title = meta.get("full_name", f"{owner}/{repo}")
        desc = meta.get("description") or ""
        text = (f"{title}. {desc}. Languages: {', '.join(langs) or 'n/a'}. "
                f"Stars: {meta.get('stargazers_count', 0)}, "
                f"topics: {', '.join(meta.get('topics', []) or []) or 'n/a'}.\n\n{readme}")
        return title, text
    except Exception as e:
        return url, f"[could not fetch repo: {e}]"


def extract_pdf(data: bytes) -> tuple[str, str]:
    """Return (title, text) from a PDF's text layer. Scanned PDFs (no text
    layer) need OCR, which is a later add — they return a clear marker."""
    if data[:5] != b"%PDF-":
        return "PDF document", "[not a valid PDF file]"
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        pages = [(p.extract_text() or "") for p in reader.pages[:30]]
        text = _WS_RE.sub(" ", "\n".join(pages)).strip()
        if not text:
            return "PDF document", "[no extractable text — this PDF may be scanned images]"
        return "PDF document", text[:8000]
    except Exception as e:
        return "PDF document", f"[could not read pdf: {e}]"


def build_card_fields(kind: str, raw: str = "", *,
                      audio_bytes: bytes | None = None,
                      lang_hint: str = "auto",
                      ocr_text: str | None = None,
                      pdf_bytes: bytes | None = None) -> dict:
    """Normalise any input into a full knowledge-object field dict."""
    source_url = ""
    source_type = kind

    if kind == "voice" and audio_bytes is not None:
        raw = transcribe(audio_bytes, lang_hint)
        source_type = "voice"

    elif kind == "pdf" and pdf_bytes is not None:
        title, body = extract_pdf(pdf_bytes)
        raw = f"{title}\n{body}"
        source_type = "pdf"

    elif kind == "image":
        raw = (ocr_text or raw or "").strip() or "[image with no readable text]"
        source_type = "image"

    else:
        stripped = raw.strip()
        url_match = _URL_RE.search(stripped)
        # treat as a link if explicitly a link, or the input is basically just a URL
        if kind == "link" or (url_match and len(stripped) - len(url_match.group(0)) < 30):
            if url_match:
                url = url_match.group(0)
                source_url = url
                if "github.com" in url:
                    title, body = fetch_github(url)
                    source_type = "github"
                else:
                    title, body = fetch_link(url)
                    source_type = "link"
                raw = f"{title}\n{body}" if body and not body.startswith("[") else title

    # text passes through unchanged
    meta = llm.enrich_full(raw, source_type)
    return {
        "kind": source_type,
        "raw": raw.strip()[:8000],
        "title": meta["title"],
        "summary": meta["summary"],
        "tags": meta["tags"],
        "topic": meta["topic"],
        "difficulty": meta["difficulty"],
        "importance": meta["importance"],
        "source_url": source_url,
        "source_type": source_type,
    }
