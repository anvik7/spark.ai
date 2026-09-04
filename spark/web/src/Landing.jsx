import React, { useState } from "react";
import { Chakra } from "./Chakra.jsx";

// Core 6 Modules of the Unified Spark AI Workspace
const MODULES = [
  {
    id: "tasks",
    label: "Tasks",
    tagline: "Universal Reasoning & Problem Solving",
    summary: "Turn questions, problems, and daily work into clear AI-assisted solutions with step-by-step reasoning and actionable answers.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
        <path d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    details: [
      "Bring any complex problem, calculation, or conceptual question",
      "Structured reasoning with step-by-step mathematical & technical logic",
      "Precise coding generation, bug diagnosis, and architecture guidance",
      "Direct follow-up questions to refine and expand solutions",
    ],
  },
  {
    id: "capture",
    label: "Capture",
    tagline: "Effortless Thought & Knowledge Recording",
    summary: "Save thoughts, web links, documents, and voice recordings into a clean knowledge stream. Spark organizes, summarizes, and indexes everything.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
        <path d="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    details: [
      "Minimalist text notes, web link extraction, and PDF document reading",
      "Built-in speech-to-text voice notes with automatic transcription",
      "Instant AI key insight extraction, topic tagging, and summaries",
      "Revisit ideas anytime with instant semantic search and exportable cards",
    ],
  },
  {
    id: "study",
    label: "Study",
    tagline: "Active Recall & Deep Understanding",
    summary: "Turn dense learning material into structured chapters, targeted active recall questions, and progressive knowledge mastery.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
      </svg>
    ),
    details: [
      "Structured chapter breakdowns from your uploaded documents",
      "Active recall testing that challenges understanding rather than memorization",
      "Targeted interactive quizzes with immediate reasoning feedback",
      "Visual mind mapping showing core conceptual relationships",
    ],
  },
  {
    id: "chat",
    label: "Chat",
    tagline: "Real-Time Collaboration & Knowledge Sharing",
    summary: "Connect with communities and peers, exchange ideas, and share knowledge cards directly in real time.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="8" r="3" />
        <circle cx="12" cy="16" r="3" />
        <path d="M10.5 10.5l1.5 2.5 M13.5 10.5l-1.5 2.5" />
      </svg>
    ),
    details: [
      "Discover and join open communities around shared topics and goals",
      "Real-time messaging with message edits, threading, and sticker reactions",
      "Share your captured knowledge cards directly into conversations",
      "Private direct messaging available with verified subscriptions",
    ],
  },
  {
    id: "career",
    label: "Career OS",
    tagline: "Target Opportunity & Readiness Intelligence",
    summary: "Evaluate your actual resume against any target role or job description to uncover verified strengths, genuine skill gaps, and action plans.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
        <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z" />
      </svg>
    ),
    details: [
      "Upload PDF, DOCX, or paste resume text for instant deep evaluation",
      "Compare directly against real target roles and job descriptions",
      "Accurate readiness scoring with verified strengths and gap identification",
      "ATS formatting audits and tailored cover letter generation",
    ],
  },
  {
    id: "coach",
    label: "Interview Coach",
    tagline: "On-Demand Intelligent Guidance & Voice Practice",
    summary: "Practice real mock interviews and get strategic AI direction whenever you need to prepare for high-stakes conversations.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
        <path d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-1a6 6 0 0 1 12 0v1 M18 8l2 2-2 2" />
      </svg>
    ),
    details: [
      "Realistic voice-to-voice interview simulator with conversational turn-taking",
      "Role-tailored questions covering technical, behavioral, and situational depth",
      "Immediate scorecard evaluating clarity, structure, and depth",
      "Echo-suppression and natural voice interaction",
    ],
  },
];

// Connected Ecosystem Workflow Steps
const WORKFLOW_STEPS = [
  { step: "01", title: "Think & Capture", text: "Record raw thoughts, documents, and voice notes effortlessly without friction." },
  { step: "02", title: "Learn & Master", text: "Turn captured material into active recall questions and progressive understanding." },
  { step: "03", title: "Solve & Work", text: "Apply insights to solve complex tasks with step-by-step AI reasoning." },
  { step: "04", title: "Connect & Share", text: "Exchange knowledge cards and collaborate in real-time community chat." },
  { step: "05", title: "Prepare & Advance", text: "Audit your resume against target opportunities to identify strengths and bridge gaps." },
  { step: "06", title: "Coach & Grow", text: "Receive strategic guidance and mock interview preparation at every milestone." },
];

export default function Landing({ onGetStarted, onLogin }) {
  const [activeTab, setActiveTab] = useState("tasks");

  const currentModule = MODULES.find((m) => m.id === activeTab) || MODULES[0];

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

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
      {/* ── 1. GLOBAL NAVBAR ── */}
      <header
        style={{
          width: "100%",
          maxWidth: 1080,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid var(--line, #E5E7EB)",
          position: "sticky",
          top: 0,
          background: "rgba(255, 255, 255, 0.94)",
          backdropFilter: "blur(10px)",
          zIndex: 100,
        }}
      >
        <div
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        >
          <Chakra size={26} />
          <span className="logo-mark" style={{ fontSize: 21, fontWeight: 800, fontFamily: "var(--sans)" }}>
            Spark
          </span>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 20 }} className="desktop-nav">
          <button
            onClick={() => scrollToSection("product")}
            style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          >
            Workspace
          </button>
          <button
            onClick={() => scrollToSection("ecosystem")}
            style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          >
            Ecosystem
          </button>
          <button
            onClick={() => scrollToSection("pricing")}
            style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          >
            Pricing
          </button>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onLogin}
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
              boxShadow: "0 2px 8px rgba(245,158,11,.3)",
              transition: "transform .15s ease",
            }}
          >
            Start with Spark
          </button>
        </div>
      </header>

      {/* ── 2. HERO SECTION ── */}
      <section
        style={{
          width: "100%",
          maxWidth: 960,
          padding: "56px 20px 48px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--marigold-light, #FEF9EC)",
            border: "1px solid var(--marigold)",
            borderRadius: 20,
            padding: "4px 14px",
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--marigold-dark, #D97706)",
            marginBottom: 20,
            letterSpacing: ".06em",
            textTransform: "uppercase",
          }}
        >
          <span>⚡</span> One AI Workspace for Everything That Matters
        </div>

        <h1
          style={{
            fontFamily: "var(--display, Georgia, serif)",
            fontSize: "clamp(34px, 5.5vw, 56px)",
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.8px",
            color: "var(--ink, #0D1117)",
            margin: "0 0 20px",
            maxWidth: 780,
          }}
        >
          Your AI workspace for everything you do.
        </h1>

        <p
          style={{
            fontSize: "clamp(16px, 2.2vw, 19px)",
            lineHeight: 1.6,
            color: "var(--ink-soft, #57606A)",
            margin: "0 auto 32px",
            maxWidth: 620,
          }}
        >
          Think, capture, learn, work, connect, and grow — in one intelligent workspace.
          Spark brings your daily tasks, ideas, active study, conversations, and career
          readiness together.
        </p>

        {/* Primary and Secondary CTAs */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <button
            onClick={onGetStarted}
            style={{
              background: "var(--p-gradient, linear-gradient(135deg, #F59E0B, #D97706))",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "var(--r-s, 10px)",
              padding: "15px 32px",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(245,158,11,.35)",
              transition: "all .15s ease",
            }}
          >
            Start with Spark →
          </button>

          <button
            onClick={() => scrollToSection("product")}
            style={{
              background: "var(--surface-2, #F8F9FA)",
              color: "var(--ink, #0D1117)",
              border: "1px solid var(--line, #E5E7EB)",
              borderRadius: "var(--r-s, 10px)",
              padding: "15px 26px",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            See how it works ↓
          </button>
        </div>

        <p style={{ fontSize: 13, color: "var(--ink-faint, #9CA3AF)", margin: 0 }}>
          Free plan included · No credit card required · Works on desktop and mobile
        </p>
      </section>

      {/* ── 3. INTERACTIVE PRODUCT SHOWCASE ── */}
      <section
        id="product"
        style={{
          width: "100%",
          maxWidth: 1040,
          padding: "20px 20px 60px",
        }}
      >
        <div
          style={{
            background: "var(--surface)",
            border: "1.5px solid var(--line, #E5E7EB)",
            borderRadius: "var(--r, 16px)",
            boxShadow: "var(--sh, 0 4px 12px rgba(0,0,0,.08))",
            overflow: "hidden",
          }}
        >
          {/* Workspace Tab Bar */}
          <div
            style={{
              display: "flex",
              overflowX: "auto",
              background: "var(--surface-2, #F8F9FA)",
              borderBottom: "1px solid var(--line, #E5E7EB)",
              padding: "8px 12px",
              gap: 8,
            }}
          >
            {MODULES.map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveTab(m.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: activeTab === m.id ? "var(--surface)" : "transparent",
                  color: activeTab === m.id ? "var(--ink)" : "var(--ink-soft)",
                  fontWeight: activeTab === m.id ? 700 : 500,
                  fontSize: 13.5,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: activeTab === m.id ? "var(--sh-sm)" : "none",
                  transition: "all .15s ease",
                }}
              >
                <span style={{ color: activeTab === m.id ? "var(--marigold-dark)" : "inherit" }}>
                  {m.icon}
                </span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          {/* Active Module Live Showcase Card */}
          <div style={{ padding: "32px 28px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--marigold-dark)" }}>
                {currentModule.label} Module
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
                {currentModule.tagline}
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--ink-soft)", margin: "4px 0 0", maxWidth: 740 }}>
                {currentModule.summary}
              </p>
            </div>

            {/* Feature Capabilities Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 12,
                marginTop: 20,
              }}
            >
              {currentModule.details.map((point, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "14px 16px",
                    background: "var(--surface-2, #F8F9FA)",
                    border: "1px solid var(--line, #E5E7EB)",
                    borderRadius: 10,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: "var(--ink)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <span style={{ color: "var(--marigold-dark)", fontWeight: 800, fontSize: 14 }}>✓</span>
                  <span>{point}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={onGetStarted}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--marigold-dark)",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 0",
                }}
              >
                Experience {currentModule.label} in Spark →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. WHAT CAN I ACTUALLY DO WITH SPARK? ── */}
      <section
        style={{
          width: "100%",
          maxWidth: 960,
          padding: "40px 20px 64px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div className="eyebrow" style={{ color: "var(--marigold-dark)", fontSize: 11.5, letterSpacing: ".1em", marginBottom: 8 }}>
            CORE CAPABILITIES
          </div>
          <h2 style={{ fontFamily: "var(--display)", fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 700, margin: "0 0 12px", color: "var(--ink)" }}>
            What you can accomplish with Spark
          </h2>
          <p style={{ fontSize: 16, color: "var(--ink-soft)", margin: 0, maxWidth: 580, marginLeft: "auto", marginRight: "auto" }}>
            Six interconnected functions designed to support your daily workflow from first thought to tangible growth.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          {MODULES.map((m) => (
            <div
              key={m.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line, #E5E7EB)",
                borderRadius: "var(--r, 16px)",
                padding: "24px 20px",
                boxShadow: "var(--sh-sm)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ color: "var(--marigold-dark)" }}>{m.icon}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>
                  {m.label}
                </span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px", color: "var(--ink)" }}>
                {m.tagline}
              </h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)", margin: 0, flex: 1 }}>
                {m.summary}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. THE BIG DIFFERENCE (CONNECTED ECOSYSTEM) ── */}
      <section
        id="ecosystem"
        style={{
          width: "100%",
          background: "var(--surface-2, #F8F9FA)",
          borderTop: "1px solid var(--line, #E5E7EB)",
          borderBottom: "1px solid var(--line, #E5E7EB)",
          padding: "64px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ width: "100%", maxWidth: 960 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="eyebrow" style={{ color: "var(--marigold-dark)", fontSize: 11.5, letterSpacing: ".1em", marginBottom: 8 }}>
              THE SPARK ADVANTAGE
            </div>
            <h2 style={{ fontFamily: "var(--display)", fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 700, margin: "0 0 12px", color: "var(--ink)" }}>
              Everything you do in Spark stays connected.
            </h2>
            <p style={{ fontSize: 16, color: "var(--ink-soft)", margin: "0 auto", maxWidth: 640, lineHeight: 1.6 }}>
              Unlike separate tools that fragment your knowledge, Spark links your activities
              into a compounding cycle: from ideas and learning to problem solving and career readiness.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {WORKFLOW_STEPS.map((s) => (
              <div
                key={s.step}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line, #E5E7EB)",
                  borderRadius: 12,
                  padding: "20px",
                  boxShadow: "var(--sh-sm)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--marigold-dark)", marginBottom: 8 }}>
                  {s.step}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
                  {s.title}
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-soft)", margin: 0 }}>
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. BUILT FOR EVERYONE POSITIONING ── */}
      <section
        style={{
          width: "100%",
          maxWidth: 960,
          padding: "64px 20px",
          textAlign: "center",
        }}
      >
        <h2 style={{ fontFamily: "var(--display)", fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 700, margin: "0 0 16px", color: "var(--ink)" }}>
          One workspace. Whatever you are working toward.
        </h2>
        <p style={{ fontSize: 16.5, lineHeight: 1.65, color: "var(--ink-soft)", maxWidth: 680, margin: "0 auto 32px" }}>
          Wherever you are and whatever you are building, Spark grows with you.
          It gives you clarity when thinking, depth when learning, execution when working,
          and genuine preparation when reaching for your next opportunity.
        </p>

        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 16,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderRadius: 30,
            padding: "8px 24px",
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          <span>Think clearly</span>
          <span style={{ color: "var(--ink-faint)" }}>•</span>
          <span>Get things done</span>
          <span style={{ color: "var(--ink-faint)" }}>•</span>
          <span>Keep learning</span>
          <span style={{ color: "var(--ink-faint)" }}>•</span>
          <span>Keep moving</span>
        </div>
      </section>

      {/* ── 7. PRICING SECTION (AUTHENTIC SUBSCRIPTION SYSTEM) ── */}
      <section
        id="pricing"
        style={{
          width: "100%",
          maxWidth: 960,
          padding: "20px 20px 64px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div className="eyebrow" style={{ color: "var(--marigold-dark)", fontSize: 11.5, letterSpacing: ".1em", marginBottom: 8 }}>
            TRANSPARENT PLANS
          </div>
          <h2 style={{ fontFamily: "var(--display)", fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 700, margin: "0 0 10px", color: "var(--ink)" }}>
            Choose your Spark plan
          </h2>
          <p style={{ fontSize: 15, color: "var(--ink-soft)", margin: 0 }}>
            Start free. Upgrade whenever you need higher capacity and dedicated tools.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {/* Free Tier */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r, 16px)",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              boxShadow: "var(--sh-sm)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
              Free
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", marginBottom: 4 }}>
              ₹0 <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-soft)" }}>/ month</span>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 20, minHeight: 38 }}>
              Core workspace for personal thinking and everyday questions.
            </p>

            <button
              onClick={onGetStarted}
              style={{
                padding: "11px 16px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                color: "var(--ink)",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: 20,
              }}
            >
              Start Free
            </button>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, fontSize: 13, display: "flex", flexDirection: "column", gap: 8, color: "var(--ink)" }}>
              <div>✓ Core Spark workspace</div>
              <div>✓ Tasks problem solving (10 calls/day)</div>
              <div>✓ Capture knowledge stream & voice notes</div>
              <div>✓ Active recall study mode</div>
              <div>✓ Public community chat</div>
            </div>
          </div>

          {/* Plus Tier */}
          <div
            style={{
              background: "var(--surface)",
              border: "2px solid var(--marigold)",
              borderRadius: "var(--r, 16px)",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              position: "relative",
              boxShadow: "var(--sh)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -12,
                right: 20,
                background: "var(--marigold-dark)",
                color: "#ffffff",
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: ".05em",
              }}
            >
              ⭐ POPULAR
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--marigold-dark)", textTransform: "uppercase", marginBottom: 6 }}>
              Plus
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", marginBottom: 4 }}>
              ₹499 <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-soft)" }}>/ month</span>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 20, minHeight: 38 }}>
              Higher capacity for deeper work, research, and larger projects.
            </p>

            <button
              onClick={onGetStarted}
              style={{
                padding: "11px 16px",
                borderRadius: 8,
                border: "none",
                background: "var(--p-gradient)",
                color: "#ffffff",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: 20,
              }}
            >
              Get Plus →
            </button>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, fontSize: 13, display: "flex", flexDirection: "column", gap: 8, color: "var(--ink)" }}>
              <div>✓ <strong>Everything in Free</strong></div>
              <div>✓ 100 AI calls per day</div>
              <div>✓ Up to 25 file uploads (1GB)</div>
              <div>✓ Priority AI processing</div>
              <div>✓ Advanced document extraction</div>
            </div>
          </div>

          {/* Pro Tier */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r, 16px)",
              padding: 24,
              display: "flex",
              flexDirection: "column",
              boxShadow: "var(--sh-sm)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
              Pro 🚀
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", marginBottom: 4 }}>
              ₹799 <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-soft)" }}>/ month</span>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 20, minHeight: 38 }}>
              Complete capability suite with private chat and career OS.
            </p>

            <button
              onClick={onGetStarted}
              style={{
                padding: "11px 16px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "var(--ink)",
                color: "#ffffff",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: 20,
              }}
            >
              Get Pro →
            </button>

            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, fontSize: 13, display: "flex", flexDirection: "column", gap: 8, color: "var(--ink)" }}>
              <div>✓ <strong>Everything in Plus</strong></div>
              <div>✓ Unlimited AI calls</div>
              <div>✓ Private 1-on-1 direct chat</div>
              <div>✓ Full Career OS & resume audit</div>
              <div>✓ Interactive voice mock interviews</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. FINAL CTA BANNER ── */}
      <section
        style={{
          width: "100%",
          maxWidth: 960,
          padding: "0 20px 64px",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #0D1117 0%, #1E293B 100%)",
            borderRadius: "var(--r-l, 22px)",
            padding: "48px 32px",
            color: "#FFFFFF",
            textAlign: "center",
            boxShadow: "var(--sh-lg)",
          }}
        >
          <div style={{ display: "inline-block", fontSize: 28, marginBottom: 12 }}>⚡</div>
          <h2 style={{ fontFamily: "var(--display)", fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 700, margin: "0 0 12px" }}>
            Make Spark your workspace.
          </h2>
          <p style={{ fontSize: 16, color: "#9CA3AF", maxWidth: 520, margin: "0 auto 28px", lineHeight: 1.6 }}>
            Bring your thoughts, learning, tasks, conversations, and career growth together into one intelligent place.
          </p>
          <button
            onClick={onGetStarted}
            style={{
              background: "var(--marigold, #F59E0B)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "var(--r-s, 10px)",
              padding: "16px 36px",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(245,158,11,.4)",
              transition: "transform .15s ease",
            }}
          >
            Start with Spark — It's Free →
          </button>
        </div>
      </section>

      {/* ── 9. FOOTER ── */}
      <footer
        style={{
          width: "100%",
          maxWidth: 960,
          borderTop: "1px solid var(--line, #E5E7EB)",
          padding: "28px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "var(--ink-faint, #9CA3AF)",
          fontSize: 13,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Chakra size={18} />
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>Spark</span>
          <span>· Universal AI Workspace</span>
        </div>
        <div>Your thoughts and data stay yours.</div>
      </footer>
    </div>
  );
}
