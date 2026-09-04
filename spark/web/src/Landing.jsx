import React from "react";
import { Chakra } from "./Chakra.jsx";

const PILLARS = [
  {
    icon: "⚡",
    tag: "CAPTURE",
    title: "Capture anything in seconds",
    description: "Drop thoughts, paste web links, upload PDFs, or record quick voice notes like a private stream. Spark does the filing.",
    bullets: ["Paste links & auto-extract metadata", "PDF & document reader", "Voice notes with audio transcription"],
  },
  {
    icon: "🧠",
    tag: "AI ORGANIZER",
    title: "AI organizes & tags automatically",
    description: "Every item you capture becomes a structured knowledge card with automatic summaries, key topics, and difficulty ratings.",
    bullets: ["Auto-tagging & key insight extraction", "Topic categorization", "Importance & difficulty scoring"],
  },
  {
    icon: "📚",
    tag: "STREAM & CARDS",
    title: "Instant knowledge stream & cards",
    description: "Your captures appear instantly in your private knowledge stream. Search, edit, tag, or export your cards as clean image cards.",
    bullets: ["Reverse-chronological capture feed", "Inline editing & one-click image share", "Tag filtering & instant search"],
  },
  {
    icon: "🎯",
    tag: "CAREER OS & COACH",
    title: "Track skill gaps & practice interviews",
    description: "Score your current skills against real live job market demand, generate 90-day learning roadmaps, and practice voice mock interviews.",
    bullets: ["Realistic AI interview simulator (Turbo TTS)", "Target role skill gap analysis", "Resume audit & personalized learning plan"],
  },
  {
    icon: "👥",
    tag: "STUDY CIRCLES",
    title: "Connect & study with peer circles",
    description: "Create or join private study circles for subjects, goals, projects, or shared interests. Share invite codes and chat in real time.",
    bullets: ["Private invite-code study groups", "Real-time circle chat with replies & edits", "Member directory & study progress tracking"],
  },
];

export default function Landing({ onGetStarted, onLogin }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--surface, #FFFFFF)",
        color: "var(--ink, #0D1117)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Top Navbar */}
      <header
        style={{
          width: "100%",
          maxWidth: 960,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: "1px solid var(--line, #E5E7EB)",
          position: "sticky",
          top: 0,
          background: "rgba(255, 255, 255, 0.92)",
          backdropFilter: "blur(8px)",
          zIndex: 50,
        }}
      >
        <div
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        >
          <Chakra size={26} />
          <span className="logo-mark" style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--display)" }}>
            Spark
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={onLogin || onGetStarted}
            style={{
              background: "none",
              border: "none",
              color: "var(--ink-soft, #57606A)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              padding: "8px 14px",
            }}
          >
            Log in
          </button>
          <button
            onClick={onGetStarted}
            style={{
              background: "var(--marigold, #F59E0B)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "var(--r-s, 10px)",
              padding: "9px 18px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(245,158,11,.3)",
              transition: "transform .15s, box-shadow .15s",
            }}
          >
            Get started
          </button>
        </div>
      </header>

      {/* Main Hero Section */}
      <main style={{ width: "100%", maxWidth: 960, padding: "48px 24px 64px" }}>
        <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 56px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "var(--marigold-light, #FEF9EC)",
              border: "1px solid var(--marigold)",
              borderRadius: 20,
              padding: "5px 14px",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--marigold-dark, #D97706)",
              marginBottom: 20,
              letterSpacing: ".04em",
              textTransform: "uppercase",
            }}
          >
            <span>✦</span> CAREER & KNOWLEDGE OS FOR BUILDERS
          </div>

          <h1
            style={{
              fontFamily: "var(--display, Georgia, serif)",
              fontSize: "clamp(34px, 6vw, 54px)",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-1px",
              color: "var(--ink, #0D1117)",
              margin: "0 0 18px",
            }}
          >
            Your second brain<br />that thinks ahead.
          </h1>

          <p
            style={{
              fontSize: "clamp(16px, 2.5vw, 18.5px)",
              lineHeight: 1.6,
              color: "var(--ink-soft, #57606A)",
              margin: "0 auto 32px",
              maxWidth: 580,
            }}
          >
            Spark is the career preparation OS for students and builders — capture what you learn, track skill gaps against live job demand, and practice interviews with an AI that thinks like a real hiring panel.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <button
              onClick={onGetStarted}
              style={{
                background: "linear-gradient(135deg, var(--marigold, #F59E0B), var(--marigold-dark, #D97706))",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "var(--r-s, 10px)",
                padding: "16px 32px",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 6px 20px rgba(245,158,11,.35)",
                transition: "all .18s ease",
              }}
            >
              Get started — it's free →
            </button>
            <button
              onClick={onLogin || onGetStarted}
              style={{
                background: "var(--surface-2, #F8F9FA)",
                color: "var(--ink, #0D1117)",
                border: "1px solid var(--line, #E5E7EB)",
                borderRadius: "var(--r-s, 10px)",
                padding: "16px 28px",
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Log in
            </button>
          </div>

          <p style={{ fontSize: 13, color: "var(--ink-faint, #9CA3AF)", margin: 0 }}>
            Free plan included · Built for students &amp; builders · No credit card required
          </p>
        </div>

        {/* Product Capabilities Section Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div className="eyebrow" style={{ fontSize: 11, letterSpacing: ".1em", marginBottom: 6 }}>
            HOW SPARK WORKS
          </div>
          <h2 style={{ fontFamily: "var(--display, Georgia, serif)", fontSize: 28, fontWeight: 700, margin: 0 }}>
            From raw thoughts to job-ready confidence.
          </h2>
        </div>

        {/* Product Feature Pillars Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
            marginBottom: 56,
          }}
        >
          {PILLARS.map((p) => (
            <div
              key={p.tag}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line, #E5E7EB)",
                borderRadius: "var(--r, 16px)",
                padding: 24,
                boxShadow: "var(--sh-sm, 0 1px 3px rgba(0,0,0,.08))",
                display: "flex",
                flexDirection: "column",
                transition: "transform .18s, box-shadow .18s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>{p.icon}</span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: ".08em",
                    color: "var(--marigold-dark, #D97706)",
                    background: "var(--marigold-light, #FEF9EC)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    textTransform: "uppercase",
                  }}
                >
                  {p.tag}
                </span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", color: "var(--ink)" }}>
                {p.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-soft)", margin: "0 0 16px", flex: 1 }}>
                {p.description}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {p.bullets.map((b) => (
                  <li key={b} style={{ fontSize: 12.5, color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--marigold)", fontWeight: 700 }}>✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom CTA Banner */}
        <div
          style={{
            background: "linear-gradient(135deg, #0D1117 0%, #1E293B 100%)",
            borderRadius: "var(--r-l, 22px)",
            padding: "40px 32px",
            color: "#FFFFFF",
            textAlign: "center",
            boxShadow: "var(--sh-lg)",
          }}
        >
          <div style={{ display: "inline-block", fontSize: 32, marginBottom: 12 }}>✺</div>
          <h2 style={{ fontFamily: "var(--display)", fontSize: 30, fontWeight: 700, margin: "0 0 12px" }}>
            Ready to build your second brain?
          </h2>
          <p style={{ fontSize: 16, color: "#9CA3AF", maxWidth: 480, margin: "0 auto 24px", lineHeight: 1.5 }}>
            Join students and builders using Spark to capture knowledge, master key concepts, and crack technical interviews.
          </p>
          <button
            onClick={onGetStarted}
            style={{
              background: "var(--marigold, #F59E0B)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "var(--r-s, 10px)",
              padding: "15px 32px",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(245,158,11,.4)",
            }}
          >
            Get started for free →
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          width: "100%",
          maxWidth: 960,
          borderTop: "1px solid var(--line, #E5E7EB)",
          padding: "24px",
          textAlign: "center",
          color: "var(--ink-faint, #9CA3AF)",
          fontSize: 13,
        }}
      >
        Spark · Your thoughts stay yours
      </footer>
    </div>
  );
}
