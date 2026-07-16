import React from "react";

// Public landing page shown to logged-out visitors — the SaaS front door.
// onGetStarted reveals the existing signup/login form in App.jsx.
function Chakra({ size = 30 }) {
  const spokes = Array.from({ length: 24 });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke="var(--marigold,#e0922f)" strokeWidth="4" />
      <circle cx="50" cy="50" r="8" fill="var(--marigold,#e0922f)" />
      {spokes.map((_, i) => {
        const a = (i * Math.PI * 2) / spokes.length;
        return <line key={i} x1={50 + 10 * Math.cos(a)} y1={50 + 10 * Math.sin(a)}
          x2={50 + 44 * Math.cos(a)} y2={50 + 44 * Math.sin(a)}
          stroke="var(--marigold,#e0922f)" strokeWidth="2.4" />;
      })}
    </svg>
  );
}

const FEATURES = [
  ["Capture anything", "A thought, link, PDF, or GitHub repo — drop it in like a private tweet. Spark does the filing."],
  ["AI does the organizing", "Every capture becomes a knowledge object: title, summary, tags, topic, difficulty — automatically."],
  ["Memory that thinks ahead", "Each morning Spark resurfaces a forgotten idea and shows how it connects to what you saved this week."],
  ["A career coach built in", "Score your skills against live job demand, get an AI resume audit, and run full mock-interview loops."],
];

export default function Landing({ onGetStarted }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--surface,#faf8f3)",
      color: "var(--ink,#1c1a17)", display: "flex", flexDirection: "column",
      alignItems: "center", padding: "0 22px" }}>
      <header style={{ width: "100%", maxWidth: 560, display: "flex",
        alignItems: "center", justifyContent: "space-between", padding: "20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Chakra size={26} />
          <span style={{ fontWeight: 700, fontSize: 19 }}>Spark.AI</span>
        </div>
        <button onClick={onGetStarted} style={{ background: "none", border: "none",
          color: "var(--ink-soft,#55504a)", fontSize: 15, cursor: "pointer" }}>Log in</button>
      </header>

      <main style={{ width: "100%", maxWidth: 560, textAlign: "center",
        paddingTop: 30, paddingBottom: 40 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Chakra size={52} />
        </div>
        <h1 style={{ fontFamily: "var(--display, Georgia, serif)", fontSize: 40,
          lineHeight: 1.1, margin: "0 0 14px", letterSpacing: "-0.5px" }}>
          Your second brain<br />that thinks ahead.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--ink-soft,#55504a)",
          margin: "0 auto 26px", maxWidth: 420 }}>
          Spark.AI is the career preparation OS for students and builders — capture what you learn, track your skill gaps against real job demand, and practice interviews with an AI that thinks like a real hiring panel.
        </p>
        <button onClick={onGetStarted} style={{ background: "var(--marigold,#e0922f)",
          color: "#fff", border: "none", borderRadius: 12, padding: "14px 30px",
          fontSize: 16, fontWeight: 600, cursor: "pointer",
          boxShadow: "0 6px 20px rgba(224,146,47,.3)" }}>
          Get started — it's free
        </button>
        <p style={{ fontSize: 12.5, color: "var(--ink-faint,#8a8378)", marginTop: 10 }}>
          No card needed · built for students &amp; builders in India
        </p>

        <div style={{ marginTop: 48, textAlign: "left", display: "grid", gap: 18 }}>
          {FEATURES.map(([title, body]) => (
            <div key={title} style={{ background: "var(--surface-2,#fff)",
              border: "1px solid var(--line,#e7e1d5)", borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ fontWeight: 650, fontSize: 16, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink-soft,#55504a)" }}>{body}</div>
            </div>
          ))}
        </div>

        <button onClick={onGetStarted} style={{ marginTop: 36, background: "var(--ink,#1c1a17)",
          color: "var(--surface,#faf8f3)", border: "none", borderRadius: 12,
          padding: "14px 30px", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
          Start your second brain →
        </button>
      </main>

      <footer style={{ width: "100%", maxWidth: 560, padding: "20px 0 30px",
        textAlign: "center", color: "var(--ink-faint,#8a8378)", fontSize: 12.5 }}>
        Spark.AI · your thoughts stay yours
      </footer>
    </div>
  );
}
