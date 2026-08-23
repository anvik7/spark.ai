"""flomo-style activity stats: a contribution heatmap + streaks."""
from collections import Counter
from datetime import date, datetime, timedelta, timezone

IST_OFFSET = timedelta(hours=5, minutes=30)  # change if you ever serve non-IST users


def _to_local_date(created, offset=IST_OFFSET):
    if isinstance(created, str):
        try:
            dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except Exception:
            return None
    elif isinstance(created, datetime):
        dt = created
    elif isinstance(created, date):
        return created
    else:
        return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt + offset).date()


def build_stats(cards: list[dict], window_days: int = 118) -> dict:
    counts: Counter = Counter()
    for c in cards:
        d = _to_local_date(c.get("created_at"))
        if d:
            counts[d] += 1

    today = (datetime.now(timezone.utc) + IST_OFFSET).date()
    start = today - timedelta(days=window_days)
    days = []
    d = start
    while d <= today:
        days.append({"date": d.isoformat(), "count": counts.get(d, 0)})
        d += timedelta(days=1)

    current = 0
    anchor = today if counts.get(today, 0) > 0 else today - timedelta(days=1)
    dd = anchor
    while counts.get(dd, 0) > 0:
        current += 1
        dd -= timedelta(days=1)

    active = sorted(counts.keys())
    longest, run, prev = 0, 0, None
    for d0 in active:
        run = run + 1 if (prev and (d0 - prev).days == 1) else 1
        longest = max(longest, run)
        prev = d0

    return {
        # names Heatmap.jsx actually consumes
        "streak": current,
        "total": sum(counts.values()),
        "longest": longest,
        "days": days,
        # kept for backward compatibility with any other caller
        "current_streak": current,
        "longest_streak": longest,
        "active_days": len(active),
        "captured_today": counts.get(today, 0),
    }