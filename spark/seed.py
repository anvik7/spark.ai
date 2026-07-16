"""Seed a demo account so the app has something to show on first run.
Run:  python -m seed   (or: python seed.py)  from the project root."""
from datetime import date, timedelta

from spark.auth import find_by_email, get_or_create_user
from spark.ingest import build_card_fields
from spark.models import Card, get_session, init_db

DEMO_EMAIL = "demo@spark.ai"
DEMO_PASSWORD = "spark1234"

SAMPLE_NOTES = [
    "Zettelkasten works because atomic notes force you to write one idea per card, which makes linking ideas trivial later.",
    "India's UPI processed over 18 billion transactions in a single month — the rails are now cheaper than cards for merchants.",
    "Spaced repetition beats re-reading: testing yourself at increasing intervals is what actually moves things to long-term memory.",
    "A good startup wedge is a narrow, painful, frequent problem — narrow enough to win, frequent enough to build a habit around.",
    "For UPSC economics, distinguish fiscal deficit (govt borrowing) from current account deficit (external trade) — examiners love the mix-up.",
    "Supabase gives you Postgres + auth + storage + row-level security out of the box, which removes weeks of backend boilerplate.",
]


def run() -> None:
    init_db()
    with get_session() as session:
        user = find_by_email(session, DEMO_EMAIL)
        if user is None:
            user = get_or_create_user(session, DEMO_EMAIL, DEMO_PASSWORD, "Demo")
            print(f"Created demo user {DEMO_EMAIL} / {DEMO_PASSWORD}")
        else:
            print(f"Demo user {DEMO_EMAIL} already exists")

        from sqlmodel import select
        existing = len(session.exec(
            select(Card).where(Card.user_id == user.id)).all())
        if existing:
            print(f"User already has {existing} cards; skipping seed.")
            return

        for i, note in enumerate(SAMPLE_NOTES):
            fields = build_card_fields("text", note)
            card = Card(user_id=user.id, **fields)
            # spread due dates so the review loop has something to show today
            card.due_on = date.today() - timedelta(days=i % 3)
            session.add(card)
        session.commit()
        print(f"Seeded {len(SAMPLE_NOTES)} cards.")


if __name__ == "__main__":
    run()
