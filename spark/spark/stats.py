"""flomo-style activity stats: a contribution heatmap + streaks.

flomo's most-loved feature is the heatmap that rewards capturing every day.
This computes per-day counts over a window plus current/longest streaks, to
power the same daily-habit loop. Pure computation over the user's cards.
"""
from collections import Counter
from datetime import date, datetime, timedelta


def _to_date(created):
    if isinstance(created, str):
        try:
            return datetime.fromisoformat(created.replace("Z", "+00:00")).date()
        except Exception:
            return None
    if isinstance(created, datetime):
        return created.date()
    return created if isinstance(created, date) else None


def build_stats(cards: list[dict], window_days: int = 118) -> dict:
    counts: Counter = Counter()
    for c in cards:
        d = _to_date(c.get("created_at"))
        if d:
            counts[d] += 1

    today = date.today()
    start = today - timedelta(days=window_days)
    days = []
    d = start
    while d <= today:
        days.append({"date": d.isoformat(), "count": counts.get(d, 0)})
        d += timedelta(days=1)

    # current streak: consecutive days with >=1 capture, anchored at today
    # (or yesterday, so the streak doesn't read 0 until you capture today)
    current = 0
    anchor = today if counts.get(today, 0) > 0 else today - timedelta(days=1)
    dd = anchor
    while counts.get(dd, 0) > 0:
        current += 1
        dd -= timedelta(days=1)

    # longest streak across all history
    active = sorted(counts.keys())
    longest, run, prev = 0, 0, None
    for d0 in active:
        run = run + 1 if (prev and (d0 - prev).days == 1) else 1
        longest = max(longest, run)
        prev = d0

    return {
        "total": sum(counts.values()),
        "active_days": len(active),
        "current_streak": current,
        "longest_streak": longest,
        "captured_today": counts.get(today, 0),
        "days": days,
    }
