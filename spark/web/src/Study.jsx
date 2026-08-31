import React, { useState, useEffect } from "react";
import { api } from "./api.js";

const DEFAULT_SUBJECTS = [
  { id: "math", name: "Mathematics & Problem Solving", icon: "📐", topics: ["Algebra & Equations", "Calculus & Derivatives", "Trigonometry", "Statistics & Probability"], progress: 65 },
  { id: "cs", name: "Computer Science & Engineering", icon: "💻", topics: ["Data Structures", "Algorithms", "Databases & SQL", "System Architecture"], progress: 80 },
  { id: "biology", name: "Biology & Life Sciences", icon: "🧬", topics: ["Cellular Genetics", "Molecular Physiology", "Ecology & Environment"], progress: 54 },
  { id: "physics", name: "Physics & Mechanics", icon: "⚡", topics: ["Newtonian Mechanics", "Thermodynamics", "Electromagnetism", "Quantum Optics"], progress: 48 },
  { id: "economics", name: "Economics & Finance", icon: "📊", topics: ["Microeconomics", "Macroeconomic Policy", "Financial Accounting"], progress: 70 },
];

export default function Study() {
  const [activeSubject, setActiveSubject] = useState(DEFAULT_SUBJECTS[0]);
  const [sessions, setSessions] = useState([]);
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Live Timer State
  const [timerActive, setTimerActive] = useState(false);
  const [timerSecs, setTimerSecs] = useState(0);
  const [materialInput, setMaterialInput] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getStudySessions().catch(() => []),
      api.listPapers().catch(() => []),
    ])
      .then(([sessData, paperData]) => {
        setSessions(sessData || []);
        setPapers(paperData || []);
      })
      .finally(() => setLoading(false));
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

  const handleSaveSession = async () => {
    if (timerSecs < 10 && !materialInput.trim()) return;
    setSaveBusy(true);
    try {
      const minutes = Math.max(1, Math.round(timerSecs / 60));
      const newSess = await api.createStudySession(
        activeSubject.name,
        materialInput.trim() || "Topic Study & Revision",
        minutes,
        timerSecs % 60
      );
      setSessions((prev) => [newSess, ...prev]);
      setTimerActive(false);
      setTimerSecs(0);
      setMaterialInput("");
      setSuccessMsg("Study session saved!");
      setTimeout(() => setSuccessMsg(""), 3000);
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

  return (
    <div className="screen">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--ink)" }}>Study Space</h1>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Personalized study roadmap, focus session timer, and learning materials.
        </p>
      </div>

      {/* Live Focus Session Timer Card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          padding: 18,
          marginBottom: 20,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)" }}>
              Active Focus Session
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "monospace", color: "var(--ink)", marginTop: 2 }}>
              {fmtTime(timerSecs)}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {!timerActive ? (
              <button
                onClick={() => setTimerActive(true)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--p-gradient)",
                  color: "#ffffff",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ▶ Start Timer
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
                ⏸ Pause
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
                {saveBusy ? "Saving…" : "Save Session"}
              </button>
            )}
          </div>
        </div>

        <input
          value={materialInput}
          onChange={(e) => setMaterialInput(e.target.value)}
          placeholder="Topic or material being studied (e.g. Linear Algebra revision)..."
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            background: "var(--surface-2)",
            fontSize: 13,
            color: "var(--ink)",
          }}
        />

        {successMsg && (
          <div style={{ fontSize: 12.5, color: "#059669", fontWeight: 600, marginTop: 8 }}>
            ✓ {successMsg}
          </div>
        )}
      </div>

      {/* Subject Selector Tabs */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 16 }}>
        {DEFAULT_SUBJECTS.map((subj) => {
          const isSelected = activeSubject.id === subj.id;
          return (
            <button
              key={subj.id}
              onClick={() => setActiveSubject(subj)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                border: isSelected ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                background: isSelected ? "var(--marigold-light)" : "var(--surface)",
                color: isSelected ? "var(--marigold-dark)" : "var(--ink)",
              }}
            >
              <span>{subj.icon}</span>
              <span>{subj.name}</span>
            </button>
          );
        })}
      </div>

      {/* Active Subject Topic Roadmap */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          padding: 18,
          marginBottom: 20,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
              {activeSubject.icon} {activeSubject.name}
            </h2>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
              {activeSubject.topics.length} core topics · {activeSubject.progress}% mastery
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--marigold-dark)" }}>
            {activeSubject.progress}%
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activeSubject.topics.map((topic, idx) => (
            <div
              key={topic}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-faint)", width: 20 }}>0{idx + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{topic}</span>
              </div>

              <button
                onClick={() => {
                  setMaterialInput(`${activeSubject.name} - ${topic}`);
                  setTimerActive(true);
                }}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--marigold-dark)",
                  background: "var(--marigold-light)",
                  border: "none",
                  padding: "4px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Study Topic →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Study Materials & Document Section */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "var(--ink)" }}>
          Study Materials & Documents
        </h2>

        {loading && (
          <div style={{ textAlign: "center", padding: 24, fontSize: 13, color: "var(--ink-soft)" }}>
            Loading study materials…
          </div>
        )}

        {!loading && papers.length === 0 && (
          <div style={{ padding: "20px 16px", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)", textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>
            No study materials uploaded yet. Go to Paper Vault to organize your notes and exam documents.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {papers.slice(0, 4).map((p) => (
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
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{p.examTag || "Study Document"} · {p.subject || "General"}</div>
                </div>
              </div>

              <a
                href={api.downloadPaperUrl(p.id)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", textDecoration: "none", padding: "4px 10px", background: "var(--marigold-light)", borderRadius: 6 }}
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
