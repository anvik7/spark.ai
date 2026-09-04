import React, { useState, useEffect, useRef } from "react";
import { api } from "./api.js";
import StudyActiveSession from "./StudyActiveSession.jsx";

export default function Study({ onOpenUpgrade }) {
  const [activeSessions, setActiveSessions] = useState([]);
  const [selectedActiveSessionId, setSelectedActiveSessionId] = useState(null);
  const [loading, setLoading] = useState(true);

  // New Active Session Form State
  const [titleInput, setTitleInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [launchingBusy, setLaunchingBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  // Session Deletion Confirmation Modal State
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadData = () => {
    setLoading(true);
    setErr("");
    api.listActiveStudySessions()
      .then((data) => setActiveSessions(data || []))
      .catch((e) => {
        console.error("Failed to load study sessions:", e);
        setErr("Study couldn't load right now.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!titleInput.trim()) {
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        setTitleInput(cleanName);
      }
    }
  };

  const handleLaunchActiveSession = async (e) => {
    e?.preventDefault();
    if (!selectedFile || !titleInput.trim()) return;

    setLaunchingBusy(true);
    setErr("");
    try {
      const f = new FormData();
      f.append("file", selectedFile);
      f.append("title", titleInput.trim());
      f.append("source_type", "document");

      const res = await api.createActiveStudySessionUpload(f);
      if (res && res.id) {
        setSelectedFile(null);
        setTitleInput("");
        setSelectedActiveSessionId(res.id);
        loadData();
      }
    } catch (error) {
      if (error.message?.includes("402") || error.message?.toLowerCase().includes("quota")) {
        onOpenUpgrade?.();
      }
      setErr(error.message || "Study couldn't load right now.");
    } finally {
      setLaunchingBusy(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!deletingSessionId) return;
    setDeleteBusy(true);
    try {
      await api.deleteActiveStudySession(deletingSessionId);
      setActiveSessions((prev) => prev.filter((s) => s.id !== deletingSessionId));
      setDeletingSessionId(null);
      loadData();
    } catch (e) {
      console.error("Failed to delete study session:", e);
      setErr(e.message || "Failed to delete session.");
    } finally {
      setDeleteBusy(false);
    }
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
    <div className="screen" style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
          Study Engine
        </h1>
        <p className="sub" style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
          Turn learning material into active learning.
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
          Add your material. Spark breaks it into focused concepts, tests your recall, and builds mastery.
        </p>
      </div>

      {err && (
        <div
          style={{
            padding: 16,
            background: "var(--surface)",
            border: "1.5px solid var(--line)",
            borderRadius: 12,
            marginBottom: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
            Study couldn't load right now.
          </div>
          <button
            type="button"
            onClick={loadData}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              background: "var(--p-gradient)",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Start Session Card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 14,
          padding: 18,
          boxShadow: "var(--sh-sm)",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px", color: "var(--ink)" }}>
          Start Learning Session
        </h2>

        {/* Hidden File Input (Documents Only) */}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.doc,.docx"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {/* Primary Action Button */}
        {!selectedFile ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              width: "100%",
              padding: "12px 18px",
              borderRadius: 10,
              border: "1.5px dashed var(--marigold)",
              background: "var(--marigold-light)",
              color: "var(--marigold-dark)",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1, fontWeight: 800 }}>+</span>
            <span>Add Learning Material</span>
          </button>
        ) : (
          <div
            style={{
              padding: "10px 14px",
              background: "var(--surface-2)",
              borderRadius: 10,
              border: "1px solid var(--line)",
              fontSize: 13,
              color: "var(--ink)",
              marginBottom: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              style={{
                border: "none",
                background: "none",
                color: "#DC2626",
                fontWeight: 700,
                fontSize: 12.5,
                cursor: "pointer",
                padding: "2px 8px",
              }}
            >
              Remove
            </button>
          </div>
        )}

        {/* Form Inputs */}
        <form onSubmit={handleLaunchActiveSession} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>
              Session title
            </label>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Session title"
              required
              style={{
                width: "100%",
                padding: "9.5px 14px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                fontSize: 13.5,
                background: "var(--surface-2)",
                color: "var(--ink)",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="submit"
              disabled={launchingBusy || !selectedFile || !titleInput.trim()}
              style={{
                width: "100%",
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: launchingBusy || !selectedFile || !titleInput.trim() ? "var(--line)" : "var(--p-gradient)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 700,
                cursor: launchingBusy || !selectedFile || !titleInput.trim() ? "not-allowed" : "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
              }}
            >
              {launchingBusy ? "Processing Material…" : "Start Learning"}
            </button>
          </div>
        </form>
      </div>

      {/* Continue Learning Drawer */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
            Continue Learning
          </h2>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "2px 8px", borderRadius: 10 }}>
            {activeSessions.length} sessions
          </span>
        </div>

        {loading && (
          <div style={{ padding: 30, textAlign: "center", color: "var(--ink-soft)" }}>
            <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading sessions…
          </div>
        )}

        {!loading && activeSessions.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)" }}>
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
              No active learning sessions. Add your material above to begin.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activeSessions.map((as) => {
            const mastery = Math.round(as.overallMasteryPercent || 0);
            let tierLabel = "Ready";
            let tierColor = "#0284C7";
            let tierBg = "#E0F2FE";

            if (mastery >= 85) {
              tierLabel = "Mastered";
              tierColor = "#059669";
              tierBg = "#D1FAE5";
            } else if (mastery >= 40) {
              tierLabel = "In Progress";
              tierColor = "#D97706";
              tierBg = "#FEF3C7";
            } else if (as.completedChaptersCount > 0) {
              tierLabel = "Needs Review";
              tierColor = "#DC2626";
              tierBg = "#FEE2E2";
            }

            return (
              <div
                key={as.id}
                style={{
                  background: "var(--surface)",
                  border: "1.5px solid var(--line)",
                  borderRadius: 12,
                  padding: 14,
                  boxShadow: "var(--sh-sm)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: tierColor, background: tierBg, padding: "2px 6px", borderRadius: 4 }}>
                      {tierLabel}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                      {as.completedChaptersCount || 0} of {as.totalChaptersCount || 0} concepts
                    </span>
                  </div>

                  <h3
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      margin: 0,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {as.title}
                  </h3>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: tierColor }}>
                      {mastery}% Mastery
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedActiveSessionId(as.id)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      background: "var(--marigold-light)",
                      color: "var(--marigold-dark)",
                      border: "none",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Continue →
                  </button>

                  {/* Unobtrusive Delete Action */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingSessionId(as.id);
                    }}
                    title="Delete session"
                    style={{
                      padding: "6px 9px",
                      borderRadius: 8,
                      background: "transparent",
                      color: "var(--ink-soft)",
                      border: "1px solid var(--line)",
                      fontSize: 13,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingSessionId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1.5px solid var(--line)",
              borderRadius: 14,
              padding: 20,
              maxWidth: 380,
              width: "100%",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 8px", color: "var(--ink)" }}>
              Delete Study Session
            </h3>
            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 18px", lineHeight: 1.4 }}>
              Delete this study session? This cannot be undone.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setDeletingSessionId(null)}
                disabled={deleteBusy}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--surface-2)",
                  color: "var(--ink)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSession}
                disabled={deleteBusy}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#DC2626",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: deleteBusy ? "not-allowed" : "pointer",
                }}
              >
                {deleteBusy ? "Deleting…" : "Delete Session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
