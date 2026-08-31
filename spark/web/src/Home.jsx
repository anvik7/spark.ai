import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import Avatar from "./components/Avatar.jsx";

export default function Home({ user, onNavigate }) {
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getTodayStudyStats().catch(() => null),
      api.getStudySessions().catch(() => []),
      api.getTasks().catch(() => []),
    ])
      .then(([statsData, sessionsData, tasksData]) => {
        setStats(statsData);
        setSessions(sessionsData || []);
        setTasks(tasksData?.tasks || tasksData || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const recentSession = sessions[0];
  const pendingTasks = tasks.filter((t) => !t.completed).slice(0, 3);
  const todayMinutes = stats?.today_minutes || 0;
  const targetMinutes = 180; // 3 hours daily goal
  const progressPercent = Math.min(100, Math.round((todayMinutes / targetMinutes) * 100));

  const formatMins = (m) => {
    const hrs = Math.floor(m / 60);
    const mins = m % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="screen">
      {/* Header Greeting */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--marigold-dark)", textTransform: "uppercase", letterSpacing: ".05em" }}>
            Personal Study Space
          </div>
          <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: "2px 0 0", color: "var(--ink)" }}>
            Welcome back, {user?.name ? user.name.split(" ")[0] : "Learner"}
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
            Everything you need for today's preparation.
          </p>
        </div>

        <button
          onClick={() => onNavigate("account")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <Avatar src={user?.avatar_url} name={user?.name || "User"} size={44} />
        </button>
      </div>

      {/* Today's Study Progress Card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          padding: 18,
          marginBottom: 16,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-faint)" }}>
              Today's Focus Progress
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
              {formatMins(todayMinutes)} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-soft)" }}>/ 3h daily target</span>
            </div>
          </div>

          <div
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              background: progressPercent >= 100 ? "#ECFDF5" : "var(--marigold-light)",
              color: progressPercent >= 100 ? "#059669" : "var(--marigold-dark)",
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            {progressPercent}% Goal
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden", border: "1px solid var(--line)" }}>
          <div
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              background: "var(--p-gradient)",
              borderRadius: 4,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>

      {/* Primary Action: Continue Studying */}
      <div
        style={{
          background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          padding: 18,
          marginBottom: 16,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "2px 8px", borderRadius: 8 }}>
            Current Subject
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            {recentSession ? `Last studied ${new Date(recentSession.date || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : "Ready to start"}
          </span>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
          {recentSession?.subject || "Mathematics & Problem Solving"}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 14 }}>
          {recentSession?.material || "Algebra, Calculus & Practice Problems"}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => onNavigate("study")}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "var(--p-gradient)",
              color: "#ffffff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Continue Studying →
          </button>
          <button
            onClick={() => onNavigate("practice")}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Quick Practice
          </button>
        </div>
      </div>

      {/* Today's Study Plan Tasks */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          padding: 18,
          marginBottom: 16,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Today's Study Plan</h2>
          <button
            onClick={() => onNavigate("tasks")}
            style={{ background: "none", border: "none", color: "var(--marigold-dark)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            View All ({tasks.length}) →
          </button>
        </div>

        {loading && (
          <div style={{ padding: "16px 0", textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>
            Loading study tasks…
          </div>
        )}

        {!loading && pendingTasks.length === 0 && (
          <div style={{ padding: "16px 12px", background: "var(--surface-2)", borderRadius: 8, textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>
            No pending tasks for today. <span style={{ color: "var(--marigold-dark)", fontWeight: 600, cursor: "pointer" }} onClick={() => onNavigate("tasks")}>+ Add a study task</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pendingTasks.map((t) => (
            <div
              key={t.id}
              onClick={() => onNavigate("tasks")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--line)",
                cursor: "pointer",
              }}
            >
              <div style={{ width: 16, height: 16, borderRadius: 4, border: "2px solid var(--ink-soft)", flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title}
              </div>
              {t.subject_hint && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "2px 6px", borderRadius: 6 }}>
                  {t.subject_hint}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Performance Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-faint)", textTransform: "uppercase" }}>Total Sessions</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", marginTop: 4 }}>{sessions.length}</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>Recorded in workspace</div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-faint)", textTransform: "uppercase" }}>Tasks Completed</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#059669", marginTop: 4 }}>
            {tasks.filter((t) => t.completed).length} / {tasks.length}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>Assignments done</div>
        </div>
      </div>
    </div>
  );
}
