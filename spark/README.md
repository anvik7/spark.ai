# Spark.AI

Your second brain, in seconds. Capture a thought, link, photo, or regional‑language
voice note; Spark auto‑summarises and tags it into an index card, then resurfaces it
with spaced repetition so you actually remember what you learn — and connects the dots
across your notes on demand.

Built for the mobile‑first Indian learner (UPSC / JEE / NEET / CAT aspirants and busy
professionals). Web‑first PWA — no WhatsApp dependency, no app‑store wait.

---

## What's inside

```
spark/                  FastAPI backend (the product logic)
  config.py             env-driven settings (runs with zero keys)
  models.py             SQLModel: User, Card, UsageDay  (SQLite → Postgres, no code change)
  auth.py               email/password (PBKDF2) + JWT sessions
  ingest.py             text / link / image / voice → clean card fields
  llm.py                AI adapter: mock | Gemini | Groq(Llama 3) | Anthropic
  srs.py                spaced repetition (SM-2)
  transcribe.py         regional voice notes (mock | Bhashini | Whisper)
  subscription.py       free-tier gating + Razorpay
  main.py               the API + serves the built PWA
web/                    React + Vite PWA (mobile-first)
seed.py                 demo account + sample cards
Dockerfile, docker-compose.yml
```

The core principle from the brief is respected throughout: **the model is a swappable
wrapper; the value is the data workflow.** Everything runs offline in `mock` mode and
upgrades to real providers by setting one env var + a key.

---

## Run it locally (2 minutes, no keys)

**Backend**
```bash
pip install -r requirements.txt
cp .env.example .env          # optional — defaults already work
python -m seed                # demo@spark.ai / spark1234 + sample cards
uvicorn spark.main:app --reload --port 8000
```

**Frontend** (separate terminal)
```bash
cd web
npm install
npm run dev                   # http://localhost:5173  (proxies /api to :8000)
```

Open http://localhost:5173 and sign in with `demo@spark.ai` / `spark1234`, or create
a new account.

### One-container mode (serves API + PWA together)
```bash
cd web && npm install && npm run build && cd ..
uvicorn spark.main:app --port 8000      # everything on http://localhost:8000
```

### Docker
```bash
cp .env.example .env
docker compose up --build               # http://localhost:8000
```

---

## Turning on real AI (optional)

Pick one provider in `.env`. Groq runs Llama 3 free and fast; Anthropic and Gemini are
drop-in too.

```env
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
```

Regional voice notes: set `TRANSCRIBER=bhashini` + `BHASHINI_API_KEY`, then wire the
pipeline call in `spark/transcribe.py::_bhashini` (one TODO, marked in the file).

---

## Going live (publish checklist)

1. **Database** — set `DATABASE_URL` to a managed Postgres
   (`postgresql+psycopg://user:pass@host:5432/spark`). Add `psycopg[binary]` to
   requirements. No code changes; SQLModel handles it.
2. **Secrets** — set a long random `JWT_SECRET`. Rotate provider keys out of `.env`
   into your host's secret manager.
3. **HTTPS** — deploy behind a TLS terminator (Render/Railway/Fly give you this free;
   or Caddy/Nginx in front).
4. **Host** — `docker compose up` works on any VPS; or push the Dockerfile to
   Render / Railway / Fly.io. Point a domain at it.
5. **Billing** — see below.

---

## Subscriptions (Razorpay)

Pro is ₹199/month (`PRO_PRICE_INR`). Free tier holds 100 cards and 20 AI calls/day
(`FREE_CARD_LIMIT`, `FREE_AI_CALLS_PER_DAY`).

1. Create a Razorpay account → complete KYC → grab **Key ID** + **Key Secret**.
2. Set in `.env`:
   ```env
   RAZORPAY_KEY_ID=rzp_live_...
   RAZORPAY_KEY_SECRET=...
   RAZORPAY_WEBHOOK_SECRET=...
   ```
3. Add the Razorpay Checkout script to `web/index.html`:
   `<script src="https://checkout.razorpay.com/v1/checkout.js"></script>`
   (The Upgrade screen already calls `window.Razorpay` when a live key is present;
   without keys it falls back to a mock "instant upgrade" so you can test the flow.)
4. In the Razorpay dashboard, add a **webhook** → URL `https://yourdomain/api/billing/webhook`,
   secret = `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured` / `order.paid`.
   The webhook is the source of truth that flips a user to Pro.

> For true auto-renewing subscriptions (vs monthly orders), switch
> `subscription.create_checkout` to Razorpay **Subscriptions** (plans + `subscription_id`)
> and handle `subscription.charged`. The webhook handler already accepts that event.

---

## API quick reference

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` · `/login` | account + JWT |
| GET  | `/api/me` | profile, plan, card count |
| POST | `/api/cards` | save text/link card (AI-tagged) |
| POST | `/api/cards/voice` | save a voice note (multipart) |
| GET  | `/api/cards?tag=&q=` | list / filter |
| GET  | `/api/tags` | tag counts |
| GET  | `/api/review/due` | cards due today |
| POST | `/api/review/{id}/grade` | SM-2 grade (0–5) |
| POST | `/api/connect` | connect-the-dots briefing |
| POST | `/api/billing/checkout` · `/verify` · `/webhook` | Razorpay |

---

## Known next steps (honest list)

- **DB migrations**: add Alembic before the first prod schema change.
- **Image OCR**: `ingest.py` accepts `ocr_text`; wire on-device ML Kit / a server OCR
  to populate it (the brief's "process locally, send structured text" point).
- **Rate-limit hardening**: free-tier AI quota is per-user/day in `UsageDay`; add an
  IP-level limiter (e.g. slowapi) at the edge for abuse.
- **Daily digest delivery**: the SRS `due_cards` query powers the in-app review; add a
  scheduler + push/email if you want the 8 AM nudge outside the app.
