# AGENTS.md — Spark

Standing context and rules for AI agents (Antigravity, Cursor, Claude Code) working
in this repo. Read this before planning any task.

## What Spark is

A mobile-first PWA "second brain" for Indian students and professionals. The user
captures a thought, link, photo, or regional-language voice note; Spark auto-summarises
and tags it into an index card, resurfaces cards with spaced repetition, and can draft
a connected briefing across saved notes. Web-first — no WhatsApp, no app store.

Design principle (do not violate): **the LLM is a swappable wrapper; the value is the
data workflow.** Everything must keep running with zero API keys (a deterministic
`mock` mode), and upgrade to a real provider via one env var. Never hard-wire a single
model or make a feature crash when a key is absent.

## Stack

- Backend: Python 3.12, FastAPI, SQLModel (SQLite in dev → Postgres in prod, no code
  change), PyJWT, httpx. Entry point: `spark.main:app`.
- Frontend: React 18 + Vite (no router; state-based nav). Plain CSS design system in
  `web/src/index.css`. Lives in `web/`.
- AI adapter: `spark/llm.py` — providers `mock | gemini | groq | anthropic`, selected
  by `LLM_PROVIDER`.
- Billing: Razorpay (`spark/subscription.py`), guarded so it mock-activates without keys.

## File map

```
spark/
  config.py        env-driven settings (Pydantic Settings)
  models.py        User, Card, UsageDay
  auth.py          PBKDF2 password hashing + JWT; current_user dependency
  ingest.py        text/link/image/voice -> {kind, raw, summary, tags, source_url}
  llm.py           enrich() + synthesize(); per-provider calls + mock fallback
  srs.py           SM-2 scheduler: schedule(card, grade), due_cards(cards)
  transcribe.py    regional voice (mock | bhashini | whisper) — _bhashini is a TODO
  subscription.py  is_pro, can_add_card, check_ai_quota, Razorpay helpers
  main.py          FastAPI app, all routes, serves web/dist as the PWA
web/               Vite React PWA
seed.py            demo@spark.ai / spark1234 + sample cards
```

## How to run

```bash
# backend
pip install -r requirements.txt
python -m seed                              # demo data
uvicorn spark.main:app --reload --port 8000

# frontend (separate terminal)
cd web && npm install && npm run dev        # :5173, proxies /api -> :8000

# one-container (serves API + built PWA on :8000)
cd web && npm run build && cd .. && uvicorn spark.main:app --port 8000
```

Build/lint check before declaring a frontend task done: `cd web && npm run build`.

## Conventions

- Keep the offline `mock` path working for every AI/voice/billing feature. Add a new
  provider as a function in the relevant module, gated on its key, with mock fallback.
- New DB columns: there are no migrations yet (`init_db` uses `create_all`). If you add
  a column, also add Alembic and an initial migration — do not silently break the schema.
- Auth: protect every user-data route with `Depends(current_user)`; never trust a
  `user_id` from the request body.
- Free-tier limits live in `subscription.py` (`can_add_card`, `check_ai_quota`). Gate
  any new AI-spending endpoint through `check_ai_quota`.
- Frontend: no new heavy deps without reason; match the existing CSS-variable design
  system (`--ink`, `--marigold`, `--indigo`, the `.card` index-card pattern). The
  spark mark `✦` is the brand accent.

## Security (important for agent runs)

- Keep all secrets in `.env` / host env vars, never in committed files. `.env`,
  `spark.db`, `web/node_modules`, `web/dist` are git-ignored — keep it that way.
- `JWT_SECRET` must be set in production; the dev fallback is a random per-process value.

## Status — built vs next

Built and tested: email/password auth + JWT; text/link/voice capture with AI tagging;
tag filtering; SM-2 review loop; connect-the-dots synthesis; Razorpay checkout/verify/
webhook with mock flow; PWA served by the API.

Good next tasks to dispatch:
1. Alembic migrations (before any schema change).
2. Wire `spark/transcribe.py::_bhashini` to the real Bhashini ASR+translate pipeline.
3. Image OCR: populate `ingest.build_card_fields(..., ocr_text=...)` from on-device
   ML Kit / a server OCR call (the "process locally, send structured text" goal).
4. Razorpay Subscriptions (auto-renew) instead of one-off orders; handle
   `subscription.charged` (webhook already accepts it).
5. Edge IP rate-limiter (e.g. slowapi) on top of the per-user daily AI quota.
