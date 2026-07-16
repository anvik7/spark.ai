import React, { useEffect, useState } from "react";
import Heatmap from "./Heatmap.jsx";

// Self-contained adaptive morning brief. Optional onNavigate jumps to Review.
async function fetchDigest() {
  const token = localStorage.getItem("spark_token") || "";
  const res = await fetch("/api/digest", { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Failed to load today's brief");
  return data;
}

const TODAY = new Date().toLocaleDateString(undefined, {
  weekday: "long", month: "long", day: "numeric",
});

function MiniCard({ card, reason }) {
  return (
    <article className="card">
      {reason && <span className="eyebrow" style={{ margin: 0 }}>{reason}</span>}
      <p className="summary" style={{ marginTop: 4 }}>{card.title || card.summary || card.raw}</p>
      {card.tags?.length > 0 && (
        <div className="tags" style={{ marginTop: 6 }}>
          {card.tags.slice(0, 4).map((t) => <span className="tag" key={t}>#{t}</span>)}
        </div>
      )}
    </article>
  );
}

export default function Digest({ onNavigate }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => { fetchDigest().then(setData).catch((e) => setErr(e.message)); }, []);

  return (
    <div className="screen">
      <Heatmap />
      <div className="eyebrow">{data?.greeting || "Today"} · {TODAY}</div>
      <h1 className="title">{data?.headline || "Your morning brief"}</h1>

      {err && <div className="err">{err}</div>}
      {!data && !err && <p className="sub">Reading your collection…</p>}

      {data?.hero && (
        <article className="card" style={{ borderLeft: "3px solid var(--marigold)" }}>
          <span className="eyebrow" style={{ margin: 0 }}>
            Saved {data.hero.age} days ago{data.hero.n_connect > 0
              ? ` · connects with ${data.hero.n_connect} new idea${data.hero.n_connect !== 1 ? "s" : ""}` : ""}
          </span>
          <p className="summary" style={{ marginTop: 6, fontSize: 18 }}>
            {data.hero.card.title || data.hero.card.summary || data.hero.card.raw}
          </p>
          {data.hero.why && (
            <p className="raw" style={{ fontStyle: "italic", marginTop: 6 }}>{data.hero.why}</p>
          )}
          {data.hero.connects?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span className="eyebrow" style={{ margin: 0 }}>Connects with</span>
              {data.hero.connects.map((c) => (
                <p className="raw" key={c.id} style={{ margin: "3px 0 0" }}>
                  → {c.title || c.summary}</p>
              ))}
            </div>
          )}
          {onNavigate && (
            <button className="btn sm" style={{ marginTop: 12 }}
              onClick={() => onNavigate("review")}>Review →</button>
          )}
        </article>
      )}

      {data?.resurfaced?.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginTop: 18 }}>Also worth revisiting</div>
          {data.resurfaced.map((r) => (
            <MiniCard key={r.card.id} card={r.card} reason={r.reason} />
          ))}
        </>
      )}

      {data && data.due_count > 0 && (
        <p className="sub" style={{ marginTop: 14 }}>
          {data.due_count} card{data.due_count !== 1 ? "s" : ""} due for review today.
          {onNavigate && (
            <button className="btn sm" style={{ marginLeft: 8 }}
              onClick={() => onNavigate("review")}>Go →</button>
          )}
        </p>
      )}

      {data?.prompt && (
        <p className="sub" style={{ marginTop: 18, fontStyle: "italic",
          textAlign: "center", color: "var(--ink-faint)" }}>{data.prompt}</p>
      )}
    </div>
  );
}
