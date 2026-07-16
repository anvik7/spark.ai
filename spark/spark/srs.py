"""Spaced repetition. A trimmed SM-2: each card, when reviewed, gets a grade
0-5; the scheduler updates ease/interval and the next due date. The daily
digest pulls cards whose due date has arrived."""
from datetime import date, timedelta
from .models import Card


def schedule(card: Card, grade: int) -> Card:
    """grade: 0 (forgot) .. 5 (perfect). Mutates and returns the card."""
    grade = max(0, min(5, grade))
    if grade < 3:
        card.reps = 0
        card.interval_days = 1
    else:
        if card.reps == 0:
            card.interval_days = 1
        elif card.reps == 1:
            card.interval_days = 6
        else:
            card.interval_days = round(card.interval_days * card.ease)
        card.reps += 1
        card.ease = max(1.3, card.ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))
    card.due_on = date.today() + timedelta(days=card.interval_days)
    return card


def due_cards(cards: list[Card], limit: int = 3) -> list[Card]:
    today = date.today()
    ready = [c for c in cards if c.due_on <= today]
    # Oldest-saved first so the digest surfaces things you'd otherwise forget.
    ready.sort(key=lambda c: c.created_at)
    return ready[:limit]
