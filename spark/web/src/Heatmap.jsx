import React, { useMemo } from "react";

// Amber color scale — matches Spark brand, actually visible
const LEVELS = [
  "#F1F3F5",   // 0  — empty (light grey)
  "#FEF3C7",   // 1  — 1 capture (cream amber)
  "#FDE68A",   // 2  — 2-3 captures (light amber)
  "#F59E0B",   // 3  — 4-6 captures (brand amber)
  "#D97706",   // 4  — 7+ captures (dark amber)
];

function level(count) {
  if (!count) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

export default function Heatmap({ days = [], streak = 0, total = 0, longest = 0 }) {
  // Build exactly 15 weeks × 7 days = 105 cells, ending today
  const cells = useMemo(() => {
    const map = {};
    days.forEach(d => { map[d.date] = d.count; });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // back up to last Sunday
    const end = new Date(today);
    end.setDate(end.getDate() - end.getDay());

    const WEEKS = 15;
    const result = [];
    for (let w = WEEKS - 1; w >= 0; w--) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(end);
        dt.setDate(end.getDate() - (w * 7) + d);
        const key = dt.toISOString().slice(0, 10);
        const isFuture = dt > today;
        week.push({ date: key, count: isFuture ? null : (map[key] || 0), future: isFuture });
      }
      result.push(week);
    }
    return result;
  }, [days]);

  const dayLabels = ["S","M","T","W","T","F","S"];

  return (
    <div style={{ marginBottom: 20 }}>
      {/* ── Stat row ── */}
      <div style={{
        display: "flex", gap: 0,
        background: "var(--surface-2, #F8F9FA)",
        border: "1px solid var(--line, #E5E7EB)",
        borderRadius: "var(--r, 12px)",
        overflow: "hidden", marginBottom: 14,
      }}>
        {[
          ["🔥", streak, "day streak"],
          ["📝", total, "total memos"],
          ["⚡", longest, "best streak"],
        ].map(([icon, val, label], i) => (
          <div key={label} style={{
            flex: 1, padding: "12px 8px", textAlign: "center",
            borderRight: i < 2 ? "1px solid var(--line, #E5E7EB)" : "none",
          }}>
            <div style={{ fontSize: 10, marginBottom: 1 }}>{icon}</div>
            <div style={{
              fontSize: 22, fontWeight: 800,
              color: i === 0 && streak > 0 ? "var(--marigold, #F59E0B)" : "var(--ink, #111827)",
              lineHeight: 1.1,
            }}>
              {val}
            </div>
            <div style={{ fontSize: 9.5, color: "var(--ink-faint, #9CA3AF)",
              textTransform: "uppercase", letterSpacing: ".06em", marginTop: 2 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Grid ── */}
      <div style={{
        background: "var(--surface, #fff)",
        border: "1px solid var(--line, #E5E7EB)",
        borderRadius: "var(--r, 12px)",
        padding: "14px 14px 10px",
        boxShadow: "var(--sh-sm, 0 1px 3px rgba(0,0,0,.07))",
      }}>
        <div style={{ display: "flex", gap: 3 }}>
          {/* Day labels column */}
          <div style={{ display: "flex", flexDirection: "column",
            gap: 3, paddingTop: 0, marginRight: 2 }}>
            {dayLabels.map((l, i) => (
              <div key={i} style={{
                width: 10, height: 11,
                fontSize: 7.5, color: "var(--ink-faint, #9CA3AF)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 500,
              }}>
                {i % 2 === 1 ? l : ""}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {cells.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {week.map((cell, di) => (
                <div
                  key={di}
                  title={cell.future ? "" : `${cell.date}: ${cell.count || 0} captures`}
                  style={{
                    width: 11, height: 11,
                    borderRadius: 2,
                    background: cell.future
                      ? "transparent"
                      : LEVELS[level(cell.count)],
                    border: cell.future
                      ? "none"
                      : level(cell.count) === 0
                        ? "1px solid var(--line, #E5E7EB)"
                        : "none",
                    transition: "transform .1s",
                    cursor: cell.count ? "pointer" : "default",
                  }}
                  onMouseEnter={e => { if (!cell.future) e.currentTarget.style.transform = "scale(1.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ""; }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 4,
          marginTop: 10, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 9, color: "var(--ink-faint, #9CA3AF)" }}>Less</span>
          {LEVELS.map((c, i) => (
            <div key={i} style={{
              width: 9, height: 9, borderRadius: 2,
              background: c,
              border: i === 0 ? "1px solid var(--line, #E5E7EB)" : "none",
            }} />
          ))}
          <span style={{ fontSize: 9, color: "var(--ink-faint, #9CA3AF)" }}>More</span>
        </div>
      </div>

      {/* Motivation line */}
      {streak === 0 && (
        <p style={{ fontSize: 12, color: "var(--ink-faint, #9CA3AF)",
          textAlign: "center", marginTop: 8 }}>
          Capture one thing today to start your streak 🔥
        </p>
      )}
      {streak > 0 && streak < 7 && (
        <p style={{ fontSize: 12, color: "var(--marigold, #F59E0B)",
          textAlign: "center", marginTop: 8, fontWeight: 500 }}>
          🔥 {streak} day streak — keep it going
        </p>
      )}
      {streak >= 7 && (
        <p style={{ fontSize: 12, color: "var(--marigold, #F59E0B)",
          textAlign: "center", marginTop: 8, fontWeight: 600 }}>
          🏆 {streak} day streak — you're on fire
        </p>
      )}
    </div>
  );
}
