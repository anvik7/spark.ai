import React, { useState, useEffect } from "react";

// Grade config: [label, sublabel, score, bg, text]
const GRADES = [
  ["Forgot",  "try again soon",   0, "#FEE2E2", "#DC2626"],
  ["Hard",    "review in 2 days", 1, "#FFEDD5", "#EA580C"],
  ["Got it",  "see next week",    3, "#DCFCE7", "#16A34A"],
  ["Easy",    "won't need long",  5, "#EDE9FE", "#7C3AED"],
];

async function req(method, path, body) {
  const token = localStorage.getItem("spark_token") || "";
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Error");
  return data;
}

export default function Review() {
  const [cards,    setCards]    = useState([]);
  const [idx,      setIdx]      = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done,     setDone]     = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState("");
  const [graded,   setGraded]   = useState(0);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const data = await req("GET", "/api/review/due");
      setCards(Array.isArray(data) ? data : []);
      setIdx(0); setRevealed(false); setDone(false); setGraded(0);
      if (!data?.length) setDone(true);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const grade = async (score) => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const card = cards[idx];
      await req("POST", `/api/review/${card.id}/grade`, { grade: score });
      const next = idx + 1;
      setGraded(g => g + 1);
      if (next >= cards.length) { setDone(true); }
      else { setIdx(next); setRevealed(false); }
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="screen">
      <div className="empty">Loading your review queue…</div>
    </div>
  );

  // ── All done ─────────────────────────────────────────────────────────────
  if (done) return (
    <div className="screen" style={{ textAlign: "center", paddingTop: 40 }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
      <h1 className="title">Queue cleared</h1>
      <p className="sub">
        {graded > 0
          ? `You reviewed ${graded} card${graded > 1 ? "s" : ""} — Spark has scheduled the next rounds.`
          : "Nothing due right now — come back tomorrow."}
      </p>
      <div style={{
        background: "var(--marigold-light, #FEF9EC)",
        border: "1px solid var(--marigold, #F59E0B)",
        borderRadius: "var(--r, 12px)",
        padding: "16px 18px",
        marginTop: 24, textAlign: "left",
      }}>
        <div className="eyebrow" style={{ marginBottom: 6, color: "var(--marigold-dark, #D97706)" }}>
          How spaced repetition works
        </div>
        <p className="summary">
          Cards you rated "Forgot" come back tomorrow. "Got it" in a week.
          "Easy" in several weeks. Spark spaces them automatically — no folders, no effort.
        </p>
      </div>
      <button className="primary" style={{ marginTop: 24 }} onClick={load}>
        Check again →
      </button>
    </div>
  );

  const card = cards[idx];
  const total = cards.length;
  const progress = idx / total;

  // ── Review card ──────────────────────────────────────────────────────────
  return (
    <div className="screen">
      {err && <div className="err">{err}</div>}

      {/* Progress bar */}
      <div style={{
        height: 3, background: "var(--line, #E5E7EB)",
        borderRadius: 2, marginBottom: 20, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", background: "var(--marigold, #F59E0B)",
          width: `${progress * 100}%`,
          borderRadius: 2, transition: "width .4s ease",
        }} />
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <div className="eyebrow">Daily review</div>
          <h1 className="title" style={{ fontSize: 26 }}>Beat the forgetting curve</h1>
        </div>
        <span style={{ fontSize: 13, color: "var(--ink-faint, #9CA3AF)", flexShrink: 0, marginLeft: 12 }}>
          {idx + 1} / {total}
        </span>
      </div>

      {/* Card */}
      <div style={{
        background: "var(--surface, #fff)",
        border: "1.5px solid var(--line, #E5E7EB)",
        borderRadius: "var(--r, 12px)",
        overflow: "hidden",
        boxShadow: "var(--sh, 0 4px 12px rgba(0,0,0,.08))",
        marginBottom: 20,
      }}>
        {/* Card meta */}
        <div style={{
          padding: "10px 16px",
          background: "var(--surface-2, #F8F9FA)",
          borderBottom: "1px solid var(--line, #E5E7EB)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: ".1em",
            textTransform: "uppercase", color: "var(--ink-faint, #9CA3AF)",
          }}>
            {card.kind || "note"} · saved {card.saved_on || card.created_at?.slice(0, 10) || "recently"}
          </span>
        </div>

        {/* Card title */}
        <div style={{ padding: "18px 16px 16px" }}>
          <p style={{
            fontSize: 17, fontWeight: 600, color: "var(--ink, #111827)",
            lineHeight: 1.45, marginBottom: 8,
          }}>
            {card.title || card.raw?.slice(0, 80) || "Untitled"}
          </p>

          {/* Revealed content */}
          {revealed ? (
            <div style={{ animation: "fadeUp .2s ease both" }}>
              <p className="raw" style={{ marginBottom: 10, whiteSpace: "pre-wrap" }}>
                {card.raw}
              </p>
              {card.summary && card.summary !== card.raw && (
                <p className="summary" style={{ marginBottom: 10, fontSize: 13, fontStyle: "italic" }}>
                  {card.summary}
                </p>
              )}
              {card.tags?.length > 0 && (
                <div className="tags">
                  {card.tags.map(t => <span className="tag" key={t}>#{t}</span>)}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setRevealed(true)}
              style={{
                background: "var(--surface-2, #F8F9FA)",
                border: "1px dashed var(--line, #E5E7EB)",
                borderRadius: 8, padding: "10px 16px",
                width: "100%", cursor: "pointer",
                fontSize: 14, color: "var(--ink-soft, #6B7280)",
                textAlign: "center", transition: "background .15s",
              }}>
              Tap to reveal full card →
            </button>
          )}
        </div>
      </div>

      {/* Grade buttons — the section that was broken */}
      {revealed && (
        <div style={{ animation: "fadeUp .2s ease both" }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>How well did you remember?</div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}>
            {GRADES.map(([label, sub, score, bg, color]) => (
              <button
                key={label}
                onClick={() => grade(score)}
                disabled={busy}
                style={{
                  background: bg,
                  border: `1.5px solid ${color}22`,
                  borderRadius: "var(--r, 12px)",
                  padding: "14px 12px",
                  cursor: busy ? "not-allowed" : "pointer",
                  textAlign: "center",
                  transition: "transform .12s, box-shadow .12s",
                  opacity: busy ? .6 : 1,
                }}
                onMouseEnter={e => { if (!busy) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,.1)"; } }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color, marginBottom: 3 }}>
                  {label}
                </div>
                <div style={{ fontSize: 11.5, color, opacity: .75 }}>
                  {sub}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
