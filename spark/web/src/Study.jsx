import React, { useState, useEffect } from "react";
import { api } from "./api.js";

export default function Study() {
  const [sessions, setSessions] = useState([]);
  const [papers, setPapers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Focus Timer State
  const [timerActive, setTimerActive] = useState(false);
  const [timerSecs, setTimerSecs] = useState(0);
  const [subjectInput, setSubjectInput] = useState("");
  const [materialInput, setMaterialInput] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.getStudySessions().catch(() => []),
      api.getTodayStudyStats().catch(() => null),
      api.listPapers().catch(() => []),
    ])
      .then(([sessData, statsData, paperData]) => {
        setSessions(sessData || []);
        setStats(statsData);
        setPapers(paperData || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let interval = null;
    if (timerActive) {
      interval = setInterval(() => {
        setTimerSecs((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive]);

  const handleStartSession = (e) => {
    e?.preventDefault();
    if (!subjectInput.trim()) return;
    setTimerActive(true);
  };

  const handleSaveSession = async () => {
    if (!subjectInput.trim()) return;
    setSaveBusy(true);
    try {
      const minutes = Math.max(1, Math.round(timerSecs / 60));
      const newSess = await api.createStudySession(
        subjectInput.trim(),
        materialInput.trim() || "Study & Revision",
        minutes,
        timerSecs % 60
      );
      setSessions((prev) => [newSess, ...prev]);
      setTimerActive(false);
      setTimerSecs(0);
      setSuccessMsg("Study session saved successfully!");
      setTimeout(() => setSuccessMsg(""), 3000);
      loadData();
    } catch (e) {
      console.error("Failed to save study session:", e);
    } finally {
      setSaveBusy(false);
    }
  };

  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const totalMinutesAllTime = sessions.reduce((acc, s) => acc + (s.duration_minutes || s.minutes || 0), 0);
  const totalHoursFormatted = (totalMinutesAllTime / 60).toFixed(1);

  return (
    <div className="screen">
      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
          Study
        </h1>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Track your focus sessions, record progress, and organize your learning materials.
        </p>
      </div>

      {/* Primary Action Card: Focus Timer & Input */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          padding: 18,
          marginBottom: 24,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)" }}>
              {timerActive ? "Focus Session Running" : "Start a Study Session"}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "monospace", color: "var(--ink)", marginTop: 2 }}>
              {fmtTime(timerSecs)}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {!timerActive ? (
              <button
                onClick={handleStartSession}
                disabled={!subjectInput.trim()}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: subjectInput.trim() ? "var(--p-gradient)" : "var(--line)",
                  color: "#ffffff",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: subjectInput.trim() ? "pointer" : "not-allowed",
                }}
              >
                Start Timer
              </button>
            ) : (
              <button
                onClick={() => setTimerActive(false)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--surface-2)",
                  color: "var(--ink)",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Pause
              </button>
            )}

            {timerSecs > 0 && (
              <button
                onClick={handleSaveSession}
                disabled={saveBusy}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "#059669",
                  color: "#ffffff",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {saveBusy ? "Saving…" : "Finish Session"}
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleStartSession} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={subjectInput}
            onChange={(e) => setSubjectInput(e.target.value)}
            placeholder="What are you studying? (e.g. Contract Law, Macroeconomics, React Architecture...)"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              fontSize: 13.5,
              color: "var(--ink)",
              outline: "none",
            }}
          />

          <input
            value={materialInput}
            onChange={(e) => setMaterialInput(e.target.value)}
            placeholder="Topic or specific goal (Optional)"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              fontSize: 13,
              color: "var(--ink)",
              outline: "none",
            }}
          />
        </form>

        {successMsg && (
          <div style={{ fontSize: 12.5, color: "#059669", fontWeight: 600, marginTop: 10 }}>
            ✓ {successMsg}
          </div>
        )}
      </div>

      {/* Your Progress Section (Real DB Stats) */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "var(--ink)" }}>
          Your Progress
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase" }}>
              Total Study Time
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", marginTop: 4 }}>
              {totalHoursFormatted} hrs
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
              Across {sessions.length} sessions
            </div>
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase" }}>
              Today's Focus
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--marigold-dark)", marginTop: 4 }}>
              {stats?.today_minutes || 0} mins
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
              Recorded today
            </div>
          </div>
        </div>
      </div>

      {/* Recent Sessions List */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Recent Sessions</h2>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{sessions.length} recorded</div>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 24, fontSize: 13, color: "var(--ink-soft)" }}>
            Loading study sessions…
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div
            style={{
              padding: "24px 16px",
              background: "var(--surface-2)",
              borderRadius: 10,
              border: "1px dashed var(--line)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>No study sessions yet</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>
              Enter what you are studying above and start a session to track your progress.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                boxShadow: "var(--sh-sm)",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                  {s.subject || "Study Session"}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
                  {s.material || "Focus session"} · {s.duration_minutes || s.minutes || 1} minutes
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                  {new Date(s.created_at || s.date || Date.now()).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </div>
                <button
                  onClick={() => {
                    setSubjectInput(s.subject || "");
                    setMaterialInput(s.material || "");
                    setTimerActive(true);
                  }}
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--marigold-dark)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Continue →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Uploaded Documents / Materials */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Learning Materials</h2>
          <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{papers.length} documents</div>
        </div>

        {!loading && papers.length === 0 && (
          <div
            style={{
              padding: "20px 16px",
              background: "var(--surface-2)",
              borderRadius: 10,
              border: "1px dashed var(--line)",
              textAlign: "center",
              fontSize: 13,
              color: "var(--ink-soft)",
            }}
          >
            No documents uploaded yet. Upload materials to keep them organized in Spark.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {papers.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>📄</span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{p.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                    {p.subject || "General Document"}
                  </div>
                </div>
              </div>

              <a
                href={api.downloadPaperUrl(p.id)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--marigold-dark)",
                  textDecoration: "none",
                  padding: "4px 10px",
                  background: "var(--marigold-light)",
                  borderRadius: 6,
                }}
              >
                View →
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
