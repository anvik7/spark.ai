import React, { useEffect, useState } from "react";

// Self-contained flomo-style activity heatmap. Fetches /api/stats and renders
// a contribution grid + streak. Drop <Heatmap /> at the top of the Today screen.
async function fetchStats() {
  const token = localStorage.getItem("spark_token") || "";
  const res = await fetch("/api/stats", { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Failed to load stats");
  return data;
}

function cellColor(n) {
  if (!n) return "var(--surface-2, #ece7db)";
  if (n < 2) return "rgba(224,146,47,.35)";
  if (n < 4) return "rgba(224,146,47,.62)";
  return "var(--marigold, #e0922f)";
}

export default function Heatmap() {
  const [data, setData] = useState(null);

  useEffect(() => { fetchStats().then(setData).catch(() => {}); }, []);
  if (!data || !data.days?.length) return null;

  // pad the front so weekday rows line up (0 = Sunday), then chunk into weeks
  const pad = new Date(data.days[0].date + "T00:00:00").getDay();
  const cells = [...Array(pad).fill(null), ...data.days];
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="eyebrow" style={{ margin: 0 }}>
        🔥 {data.current_streak} day streak · {data.total} memos
        {data.longest_streak > data.current_streak
          ? ` · best ${data.longest_streak}` : ""}
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 10, overflowX: "auto", paddingBottom: 4 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {Array.from({ length: 7 }).map((_, di) => {
              const day = week[di];
              return (
                <div key={di}
                  title={day ? `${day.date}: ${day.count} memo${day.count !== 1 ? "s" : ""}` : ""}
                  style={{ width: 11, height: 11, borderRadius: 2,
                    background: day ? cellColor(day.count) : "transparent" }} />
              );
            })}
          </div>
        ))}
      </div>
      {data.captured_today === 0 && (
        <p className="sub" style={{ margin: "8px 0 0", fontSize: 12.5 }}>
          Nothing captured today — one memo keeps the streak alive.
        </p>
      )}
    </div>
  );
}
