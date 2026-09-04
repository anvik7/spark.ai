import React, { useEffect, useState, useCallback } from "react";
import { api } from "./api.js";
import Avatar from "./components/Avatar.jsx";

// SVG Icons matching Spark's design system
const Ico = {
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  capture: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  study: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <circle cx="12" cy="16" r="3" />
      <path d="M10.5 10.5l1.5 2.5 M13.5 10.5l-1.5 2.5" />
    </svg>
  ),
  career: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z" />
    </svg>
  ),
  coach: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-1a6 6 0 0 1 12 0v1 M18 8l2 2-2 2" />
    </svg>
  ),
  arrowRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
};

export default function Home({ user, onNavigate, onOpenUpgrade }) {
  const [data, setData] = useState({
    tasks: [],
    captures: [],
    studySessions: [],
    circles: [],
    careerProfile: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadWorkspaceData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Independent fault-tolerant fetches — one failed API will never crash Home
    const results = await Promise.allSettled([
      api.getTasks().catch(() => ({ tasks: [] })),
      api.getCaptures().catch(() => []),
      api.getStudySessions().catch(() => []),
      api.myCircles().catch(() => []),
      api.getCareerProfile().catch(() => null),
    ]);

    const tasksRes = results[0].status === "fulfilled" ? results[0].value : [];
    const capturesRes = results[1].status === "fulfilled" ? results[1].value : [];
    const studyRes = results[2].status === "fulfilled" ? results[2].value : [];
    const circlesRes = results[3].status === "fulfilled" ? results[3].value : [];
    const careerRes = results[4].status === "fulfilled" ? results[4].value : null;

    // Defensive parsing
    const rawTasks = Array.isArray(tasksRes?.tasks) ? tasksRes.tasks : Array.isArray(tasksRes) ? tasksRes : [];
    const rawCaptures = Array.isArray(capturesRes) ? capturesRes : [];
    const rawStudy = Array.isArray(studyRes) ? studyRes : [];
    const rawCircles = Array.isArray(circlesRes) ? circlesRes : [];

    setData({
      tasks: rawTasks,
      captures: rawCaptures,
      studySessions: rawStudy,
      circles: rawCircles,
      careerProfile: careerRes && typeof careerRes === "object" ? careerRes : null,
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  const firstName = user?.name ? user.name.trim().split(" ")[0] : "there";
  const plan = user?.plan || "free";
  const isPaid = plan === "pro" || plan === "plus";

  // Check if user has any real activity across modules
  const hasAnyActivity =
    data.tasks.length > 0 ||
    data.captures.length > 0 ||
    data.studySessions.length > 0 ||
    data.circles.length > 0 ||
    !!data.careerProfile?.target_role;

  const pendingTasks = data.tasks.filter((t) => !t.completed).slice(0, 3);
  const recentCaptures = data.captures.slice(0, 3);
  const recentStudy = data.studySessions.slice(0, 3);
  const recentCircles = data.circles.slice(0, 3);

  return (
    <div className="screen" style={{ maxWidth: 860, margin: "0 auto", paddingBottom: 40 }}>
      {/* ── 1. PRIMARY HERO ── */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r)",
          padding: "24px 20px",
          marginBottom: 16,
          boxShadow: "var(--sh-sm)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".08em",
                color: "var(--marigold-dark)",
                background: "var(--marigold-light)",
                padding: "3px 10px",
                borderRadius: 20,
                marginBottom: 10,
              }}
            >
              <span>⚡</span> Spark Workspace
            </div>

            <h1
              style={{
                fontFamily: "var(--display)",
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 1.25,
                color: "var(--ink)",
                margin: "0 0 8px",
              }}
            >
              Your AI workspace for thinking, learning, working, and growing.
            </h1>

            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--ink-soft)",
                margin: 0,
                maxWidth: 620,
              }}
            >
              Welcome back, {firstName}. Spark brings your tasks, captured ideas, active study,
              collaborative conversations, career preparation, and AI assistance together in one
              unified system.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <button
              onClick={() => onNavigate?.("account")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              title="Account Settings"
              aria-label="Account Settings"
            >
              <Avatar src={user?.avatar_url} name={user?.name || "User"} size={44} />
            </button>

            <button
              className={`plan-chip ${isPaid ? "pro" : ""}`}
              onClick={onOpenUpgrade}
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              {plan === "pro" ? "⚡ Pro" : plan === "plus" ? "⭐ Plus" : "Free · Upgrade"}
            </button>
          </div>
        </div>
      </section>

      {/* ── 2. QUICK ACTIONS ── */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, padding: "0 4px" }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-faint)", margin: 0 }}>
            Quick Actions
          </h2>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Open any module</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 10,
          }}
        >
          <QuickActionBtn
            icon={Ico.tasks}
            label="Tasks"
            badge="Reasoning"
            onClick={() => onNavigate?.("tasks")}
          />
          <QuickActionBtn
            icon={Ico.capture}
            label="Capture"
            badge="Thoughts"
            onClick={() => onNavigate?.("capture")}
          />
          <QuickActionBtn
            icon={Ico.study}
            label="Study"
            badge="Mastery"
            onClick={() => onNavigate?.("study")}
          />
          <QuickActionBtn
            icon={Ico.chat}
            label="Chat"
            badge="Connect"
            onClick={() => onNavigate?.("circles")}
          />
          <QuickActionBtn
            icon={Ico.career}
            label="Career OS"
            badge="Readiness"
            onClick={() => onNavigate?.("career")}
          />
          <QuickActionBtn
            icon={Ico.coach}
            label="Coach"
            badge="Interview"
            onClick={() => onNavigate?.("coach")}
          />
        </div>
      </section>

      {/* ── 3. AI VALUE ARCHITECTURE ── */}
      <section
        style={{
          background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)",
          border: "1px solid var(--line)",
          borderRadius: "var(--r)",
          padding: "16px 18px",
          marginBottom: 24,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-faint)", marginBottom: 6 }}>
          Unified Intelligence
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
          Capture what matters. Turn it into knowledge. Act on it. Learn from it. Grow with it.
        </div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0, lineHeight: 1.5 }}>
          Everything you record in Spark connects across your workflow — from quick thoughts and
          problem solving to continuous recall and real-world career preparation.
        </p>
      </section>

      {/* ── 4. WORKSPACE ACTIVITY & REAL SECTIONS ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "0 4px" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
          Personal Activity
        </h2>
        {loading && (
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Updating…</span>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{error}</span>
          <button
            onClick={loadWorkspaceData}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "var(--surface)",
              border: "1px solid var(--line)",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {Ico.refresh} Retry
          </button>
        </div>
      )}

      {/* Grid of Real Activity Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {/* Card A: Tasks */}
        <ActivityCard
          title="Tasks"
          icon={Ico.tasks}
          actionLabel="View all"
          onAction={() => onNavigate?.("tasks")}
          emptyState={
            <EmptyStateItem
              text="No open tasks right now."
              actionText="+ Create a task"
              onAction={() => onNavigate?.("tasks")}
            />
          }
        >
          {pendingTasks.map((t) => (
            <div
              key={t.id}
              onClick={() => onNavigate?.("tasks")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--line)",
                cursor: "pointer",
                marginBottom: 6,
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 3, border: "1.5px solid var(--ink-soft)", flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title || t.prompt || "Untitled Task"}
              </div>
            </div>
          ))}
        </ActivityCard>

        {/* Card B: Captures */}
        <ActivityCard
          title="Captures"
          icon={Ico.capture}
          actionLabel="View stream"
          onAction={() => onNavigate?.("capture")}
          emptyState={
            <EmptyStateItem
              text="Your knowledge stream is empty."
              actionText="+ Capture an idea"
              onAction={() => onNavigate?.("capture")}
            />
          }
        >
          {recentCaptures.map((c) => (
            <div
              key={c.id}
              onClick={() => onNavigate?.("capture")}
              style={{
                padding: "8px 10px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--line)",
                cursor: "pointer",
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.title || c.summary || c.raw || "Untitled Capture"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.summary || c.raw || "Saved capture card"}
              </div>
            </div>
          ))}
        </ActivityCard>

        {/* Card C: Study Sessions */}
        <ActivityCard
          title="Active Study"
          icon={Ico.study}
          actionLabel="Open study"
          onAction={() => onNavigate?.("study")}
          emptyState={
            <EmptyStateItem
              text="No study sessions recorded yet."
              actionText="+ Start learning"
              onAction={() => onNavigate?.("study")}
            />
          }
        >
          {recentStudy.map((s, idx) => (
            <div
              key={s.id || idx}
              onClick={() => onNavigate?.("study")}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 10px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--line)",
                cursor: "pointer",
                marginBottom: 6,
              }}
            >
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.subject || s.title || "Study Session"}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.material ? s.material : s.date ? new Date(s.date).toLocaleDateString() : "Session in progress"}
                </div>
              </div>
              {s.minutes ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "2px 6px", borderRadius: 4, marginLeft: 8 }}>
                  {s.minutes}m
                </span>
              ) : null}
            </div>
          ))}
        </ActivityCard>

        {/* Card D: Conversations & Career */}
        <ActivityCard
          title="Conversations & Career"
          icon={Ico.chat}
          actionLabel="Open chat"
          onAction={() => onNavigate?.("circles")}
          emptyState={
            <EmptyStateItem
              text="No conversations or career audits yet."
              actionText="+ Explore Chat or Career OS"
              onAction={() => onNavigate?.("circles")}
            />
          }
        >
          {recentCircles.map((circle) => (
            <div
              key={circle.id}
              onClick={() => onNavigate?.("circles")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--line)",
                cursor: "pointer",
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                💬 {circle.name || "Conversation"}
              </div>
              <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>Chat</span>
            </div>
          ))}

          {data.careerProfile?.target_role && (
            <div
              onClick={() => onNavigate?.("career")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--line)",
                cursor: "pointer",
                marginTop: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                🎯 Target: {data.careerProfile.target_role}
              </div>
              <span style={{ fontSize: 11, color: "var(--c-career, #3B82F6)" }}>View Roadmap</span>
            </div>
          )}
        </ActivityCard>
      </div>

      {/* ── 5. CLEAN GET STARTED FOR FRESH USERS ── */}
      {!hasAnyActivity && !loading && (
        <section
          style={{
            marginTop: 24,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r)",
            padding: "20px",
            boxShadow: "var(--sh-sm)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
            Getting Started with Spark
          </div>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 14px" }}>
            Choose a starting point below to begin populating your personal workspace:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            <StarterAction title="Ask or Solve a Task" icon="📋" onClick={() => onNavigate?.("tasks")} />
            <StarterAction title="Capture Ideas & Notes" icon="✏️" onClick={() => onNavigate?.("capture")} />
            <StarterAction title="Start Active Learning" icon="📖" onClick={() => onNavigate?.("study")} />
            <StarterAction title="Start a Conversation" icon="👥" onClick={() => onNavigate?.("circles")} />
            <StarterAction title="Audit Career Readiness" icon="🎯" onClick={() => onNavigate?.("career")} />
            <StarterAction title="Practice with Coach" icon="💬" onClick={() => onNavigate?.("coach")} />
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Subcomponents ─────────────────────────────────────────── */

function QuickActionBtn({ icon, label, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-s, 10px)",
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        cursor: "pointer",
        transition: "transform .12s ease, border-color .15s ease, box-shadow .15s ease",
        color: "var(--ink)",
        boxShadow: "var(--sh-sm)",
        minHeight: 80,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "var(--marigold)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "var(--line)";
      }}
    >
      <div style={{ color: "var(--marigold-dark)" }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      <span style={{ fontSize: 10, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: ".04em" }}>
        {badge}
      </span>
    </button>
  );
}

function ActivityCard({ title, icon, actionLabel, onAction, emptyState, children }) {
  const childArray = React.Children.toArray(children);
  const isEmpty = childArray.length === 0;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r)",
        padding: 16,
        boxShadow: "var(--sh-sm)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--marigold-dark)" }}>{icon}</span>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--ink)" }}>{title}</h3>
        </div>
        <button
          onClick={onAction}
          style={{
            background: "none",
            border: "none",
            color: "var(--marigold-dark)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            padding: "2px 4px",
          }}
        >
          {actionLabel} →
        </button>
      </div>

      <div style={{ flex: 1 }}>{isEmpty ? emptyState : children}</div>
    </div>
  );
}

function EmptyStateItem({ text, actionText, onAction }) {
  return (
    <div
      style={{
        padding: "16px 12px",
        background: "var(--surface-2)",
        borderRadius: 8,
        border: "1px dashed var(--line)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 6 }}>{text}</div>
      <button
        onClick={onAction}
        style={{
          background: "none",
          border: "none",
          color: "var(--marigold-dark)",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {actionText}
      </button>
    </div>
  );
}

function StarterAction({ title, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        cursor: "pointer",
        textAlign: "left",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--ink)",
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1 }}>{title}</span>
      <span style={{ color: "var(--ink-faint)" }}>→</span>
    </button>
  );
}
