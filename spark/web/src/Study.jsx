import React, { useState, useEffect, useRef } from "react";
import { api } from "./api.js";
import StudyActiveSession from "./StudyActiveSession.jsx";

export default function Study({ onOpenUpgrade }) {
  const [activeSessions, setActiveSessions] = useState([]);
  const [selectedActiveSessionId, setSelectedActiveSessionId] = useState(null);
  
  const [sessions, setSessions] = useState([]);
  const [papers, setPapers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // New Active Learning Session Launcher Form
  const [launcherMode, setLauncherMode] = useState("url"); // "url", "upload", "paper"
  const [titleInput, setTitleInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [subjectInput, setSubjectInput] = useState("General Academic");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [launchingBusy, setLaunchingBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  // Focus Timer State
  const [timerActive, setTimerActive] = useState(false);
  const [timerSecs, setTimerSecs] = useState(0);
  const [focusSubjectInput, setFocusSubjectInput] = useState("");
  const [focusMaterialInput, setFocusMaterialInput] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.listActiveStudySessions().catch(() => []),
      api.getStudySessions().catch(() => []),
      api.getTodayStudyStats().catch(() => null),
      api.listPapers().catch(() => []),
    ])
      .then(([activeSessData, sessData, statsData, paperData]) => {
        setActiveSessions(activeSessData || []);
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

  const handleLaunchActiveSession = async (e) => {
    e?.preventDefault();
    setLaunchingBusy(true);
    setErr("");
    try {
      let res;
      if (launcherMode === "url") {
        if (!urlInput.trim()) return;
        res = await api.createActiveStudySessionUrl(urlInput.trim(), titleInput.trim(), subjectInput);
      } else if (launcherMode === "upload") {
        if (!selectedFile || !titleInput.trim()) return;
        const f = new FormData();
        f.append("file", selectedFile);
        f.append("title", titleInput.trim());
        f.append("subject", subjectInput);
        f.append("source_type", "video_file");
        res = await api.createActiveStudySessionUpload(f);
      } else if (launcherMode === "paper") {
        if (!selectedPaperId) return;
        res = await api.createStudyFromPaper(Number(selectedPaperId));
      }

      if (res && res.id) {
        setSelectedActiveSessionId(res.id);
        loadData();
      }
    } catch (error) {
      if (error.message?.includes("402") || error.message?.toLowerCase().includes("quota")) {
        onOpenUpgrade?.();
      }
      setErr(error.message || "Failed to initialize active study session.");
    } finally {
      setLaunchingBusy(false);
    }
  };

  const handleSaveFocusSession = async () => {
    if (!focusSubjectInput.trim()) return;
    setSaveBusy(true);
    try {
      const minutes = Math.max(1, Math.round(timerSecs / 60));
      const newSess = await api.createStudySession(
        focusSubjectInput.trim(),
        focusMaterialInput.trim() || "Focus Study",
        minutes,
        timerSecs % 60
      );
      setSessions((prev) => [newSess, ...prev]);
      setTimerActive(false);
      setTimerSecs(0);
      loadData();
    } catch (e) {
      console.error("Failed to save focus session:", e);
    } finally {
      setSaveBusy(false);
    }
  };

  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Render Active Learning Session Player if selected
  if (selectedActiveSessionId) {
    return (
      <StudyActiveSession
        sessionId={selectedActiveSessionId}
        onBack={() => {
          setSelectedActiveSessionId(null);
          loadData();
        }}
        onOpenUpgrade={onOpenUpgrade}
      />
    );
  }

  return (
    <div className="screen">
      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
          Study Engine
        </h1>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Transform passive lectures & documents into active learning sessions with AI micro-chapters, recall, and dynamic mind maps.
        </p>
      </div>

      {err && (
        <div className="err" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>⚠️ {err}</span>
          <button onClick={() => setErr("")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "inherit" }}>✕</button>
        </div>
      )}

      {/* Primary Card: Start New Active AI Learning Session */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 14,
          padding: 18,
          boxShadow: "var(--sh-sm)",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 20 }}>🚀</span>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
              Start Active AI Learning Session
            </h2>
            <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              Input a lecture video, audio, document, or Paper Vault material to extract micro-chapters & recall quizzes.
            </span>
          </div>
        </div>

        {/* Hidden File Picker Input */}
        <input
          ref={fileRef}
          type="file"
          accept="video/*,audio/*,.pdf,.txt,.doc,.docx"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setSelectedFile(file);
              setLauncherMode("upload");
              if (!titleInput.trim()) {
                setTitleInput(file.name.replace(/\.[^/.]+$/, ""));
              }
            }
          }}
          style={{ display: "none" }}
        />

        {/* Mode Selector Choice Buttons */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 14, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
          <button
            type="button"
            onClick={() => setLauncherMode("url")}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: launcherMode === "url" ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
              background: launcherMode === "url" ? "var(--marigold-light)" : "var(--surface-2)",
              color: launcherMode === "url" ? "var(--marigold-dark)" : "var(--ink-soft)",
              fontSize: 12.5,
              fontWeight: launcherMode === "url" ? 700 : 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>🔗</span>
            <span>Video / Web URL</span>
          </button>

          <button
            type="button"
            onClick={() => setLauncherMode("paper")}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: launcherMode === "paper" ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
              background: launcherMode === "paper" ? "var(--marigold-light)" : "var(--surface-2)",
              color: launcherMode === "paper" ? "var(--marigold-dark)" : "var(--ink-soft)",
              fontSize: 12.5,
              fontWeight: launcherMode === "paper" ? 700 : 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>📄</span>
            <span>From Paper Vault</span>
          </button>

          {/* Simple "+" Icon Button for Adding File / Media Source */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Add file or media source"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: launcherMode === "upload" ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
              background: launcherMode === "upload" ? "var(--marigold-light)" : "var(--surface-2)",
              color: launcherMode === "upload" ? "var(--marigold-dark)" : "var(--ink)",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            +
          </button>
        </div>

        {/* Active Session Input Form */}
        <form onSubmit={handleLaunchActiveSession} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="Session Topic / Title"
            required
            style={{
              width: "100%",
              padding: "9px 14px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              fontSize: 13.5,
              background: "var(--surface-2)",
              color: "var(--ink)",
            }}
          />

          {launcherMode === "url" && (
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="Paste video or document URL"
              required
              style={{
                width: "100%",
                padding: "9px 14px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                fontSize: 13.5,
                background: "var(--surface-2)",
                color: "var(--ink)",
              }}
            />
          )}

          {launcherMode === "upload" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--surface-2)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>{selectedFile ? `📄 ${selectedFile.name}` : "No file chosen"}</span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: "none",
                    background: "var(--marigold-light)",
                    color: "var(--marigold-dark)",
                    borderRadius: 4,
                    padding: "2px 6px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {launcherMode === "paper" && (
            <select
              value={selectedPaperId}
              onChange={(e) => setSelectedPaperId(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "9px 14px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                fontSize: 13.5,
                background: "var(--surface-2)",
                color: "var(--ink)",
              }}
            >
              <option value="">Select a Paper from your Paper Vault...</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>{p.title} ({p.subject || "General"})</option>
              ))}
            </select>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
              AI generates 3-7 min concept chapters, active recall & mind maps
            </span>

            <button
              type="submit"
              disabled={launchingBusy}
              style={{
                padding: "9px 20px",
                borderRadius: 8,
                border: "none",
                background: launchingBusy ? "var(--line)" : "var(--p-gradient)",
                color: "#ffffff",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: launchingBusy ? "not-allowed" : "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
              }}
            >
              {launchingBusy ? "Analyzing & Chaptering…" : "Start Active Session →"}
            </button>
          </div>
        </form>
      </div>

      {/* Continue Learning Active AI Sessions Drawer */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
            Continue Learning (Active Sessions)
          </h2>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "2px 8px", borderRadius: 10 }}>
            {activeSessions.length} sessions
          </span>
        </div>

        {activeSessions.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)" }}>
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
              No active learning sessions created yet. Enter a topic, URL, or document above to start your first session.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activeSessions.map((as) => (
            <div
              key={as.id}
              onClick={() => setSelectedActiveSessionId(as.id)}
              style={{
                background: "var(--surface)",
                border: "1.5px solid var(--line)",
                borderRadius: 12,
                padding: 14,
                boxShadow: "var(--sh-sm)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                transition: "all .15s ease",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)", letterSpacing: ".05em" }}>
                    {as.subject}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                    · {as.completedChaptersCount} of {as.totalChaptersCount} chapters
                  </span>
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
                  {as.title}
                </h3>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>
                    {as.overallMasteryPercent}% Mastery
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>
                    {as.processingStatus}
                  </div>
                </div>

                <button
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    background: "var(--marigold-light)",
                    color: "var(--marigold-dark)",
                    border: "none",
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  Continue →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
