import React, { useState, useEffect, useRef } from "react";
import { api } from "./api.js";

export default function StudyActiveSession({ sessionId, onBack, onOpenUpgrade }) {
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  
  // Player state
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [currentTimeSecs, setCurrentTimeSecs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const mediaRef = useRef(null);

  // Active Recall state
  const [recallInput, setRecallInput] = useState("");
  const [recallEvaluating, setRecallEvaluating] = useState(false);
  const [recallResult, setRecallResult] = useState(null);

  // Quiz state
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResults, setQuizResults] = useState({});
  const [quizBusy, setQuizBusy] = useState({});

  // Mind Map state
  const [mindmapNodes, setMindmapNodes] = useState([]);
  const [showMindmap, setShowMindmap] = useState(false);

  const loadSession = async () => {
    setLoading(true);
    try {
      const data = await api.getActiveStudySession(sessionId);
      setSessionData(data);
      setCurrentChapterIdx(data.currentChapterIndex || 0);
      setCurrentTimeSecs(data.currentTimeSeconds || 0.0);

      // Load MindMap
      api.getStudyMindMap(sessionId)
        .then((mm) => setMindmapNodes(Array.isArray(mm) ? mm : []))
        .catch(() => {});
    } catch (e) {
      setErr(e.message || "Failed to load study session.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const currentChapter = sessionData?.chapters?.[currentChapterIdx] || null;

  // Sync playback time & progress
  const handleTimeUpdate = () => {
    if (!mediaRef.current) return;
    const cur = mediaRef.current.currentTime;
    setCurrentTimeSecs(cur);

    // Save progress periodically
    if (Math.floor(cur) % 5 === 0) {
      api.updateStudyProgress(sessionId, currentChapterIdx, cur).catch(() => {});
    }
  };

  const handleJumpToChapter = (idx) => {
    if (!sessionData?.chapters?.[idx]) return;
    const targetCh = sessionData.chapters[idx];
    setCurrentChapterIdx(idx);
    setCurrentTimeSecs(targetCh.startTime || 0);

    if (mediaRef.current) {
      mediaRef.current.currentTime = targetCh.startTime || 0;
    }

    setRecallResult(null);
    setRecallInput("");

    api.updateStudyProgress(sessionId, idx, targetCh.startTime || 0).catch(() => {});
  };

  const handleActiveRecallSubmit = async (e) => {
    e?.preventDefault();
    if (!currentChapter || !recallInput.trim()) return;

    setRecallEvaluating(true);
    try {
      const res = await api.submitActiveRecall(currentChapter.id, recallInput.trim());
      setRecallResult(res);
    } catch (e) {
      setErr(e.message || "Failed to evaluate active recall.");
    } finally {
      setRecallEvaluating(false);
    }
  };

  const handleQuizAnswerSubmit = async (qId, answer) => {
    if (!answer) return;
    setQuizBusy((prev) => ({ ...prev, [qId]: true }));
    try {
      const res = await api.submitQuizAnswer(qId, answer, 10);
      setQuizResults((prev) => ({ ...prev, [qId]: res }));

      // Reload mindmap & mastery
      api.getStudyMindMap(sessionId).then((mm) => setMindmapNodes(Array.isArray(mm) ? mm : [])).catch(() => {});
      api.getActiveStudySession(sessionId).then((data) => {
        setSessionData((prev) => ({
          ...prev,
          overallMasteryPercent: data.overallMasteryPercent,
          conceptMastery: data.conceptMastery,
        }));
      }).catch(() => {});
    } catch (e) {
      setErr(e.message || "Failed to submit quiz answer.");
    } finally {
      setQuizBusy((prev) => ({ ...prev, [qId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="screen" style={{ textAlign: "center", padding: "60px 16px" }}>
        <span className="spin" style={{ display: "inline-block", fontSize: 24, marginBottom: 12 }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Initializing Active Study Engine…</div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
          Analyzing concept topic boundaries, micro-chapters, and active recall prompts.
        </div>
      </div>
    );
  }

  if (err || !sessionData) {
    return (
      <div className="screen" style={{ padding: 20 }}>
        <button onClick={onBack} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", cursor: "pointer", marginBottom: 16 }}>
          ← Back to Study
        </button>
        <div className="err" style={{ padding: 16 }}>
          ⚠️ {err || "Could not load active study session."}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      {/* Top Header & Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button
          onClick={onBack}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            background: "var(--surface-2)",
            color: "var(--ink)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>←</span>
          <span>Back to Sessions</span>
        </button>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setShowMindmap((m) => !m)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1.5px solid var(--line)",
              background: showMindmap ? "var(--marigold-light)" : "var(--surface)",
              color: showMindmap ? "var(--marigold-dark)" : "var(--ink)",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>🧠</span>
            <span>Mind Map</span>
          </button>

          <span
            style={{
              padding: "4px 10px",
              borderRadius: 12,
              background: "#ECFDF5",
              color: "#059669",
              border: "1px solid #A7F3D0",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Mastery {sessionData.overallMasteryPercent}%
          </span>
        </div>
      </div>

      {/* Session Title Bar */}
      <div style={{ marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--marigold-dark)" }}>
          {sessionData.subject} · Active Learning Loop
        </span>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "2px 0 0", color: "var(--ink)" }}>
          {sessionData.title}
        </h1>
      </div>

      {/* Interactive Dynamic Mind Map Graph (Collapsible) */}
      {showMindmap && (
        <MindMapGraph nodes={mindmapNodes} title={sessionData.title} />
      )}

      {/* Main Learning Hub Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        {/* Micro-Chapter Video/Audio Player & Summary */}
        <div style={{ background: "#0F172A", borderRadius: 14, overflow: "hidden", color: "#F8FAFC", boxShadow: "var(--sh-md)" }}>
          {sessionData.mediaUrl ? (
            <video
              ref={mediaRef}
              src={sessionData.mediaUrl}
              controls
              onTimeUpdate={handleTimeUpdate}
              style={{ width: "100%", maxHeight: 360, background: "#000000" }}
            />
          ) : (
            <div style={{ padding: 24, textAlign: "center", background: "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎧</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Interactive Audio/Concept Reader</div>
              <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 4 }}>
                Micro-chapter concept boundaries generated from source transcript.
              </div>
            </div>
          )}

          {/* Current Micro-Chapter Header Bar */}
          {currentChapter && (
            <div style={{ padding: "14px 18px", borderTop: "1px solid #1E293B", background: "#090D16" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase" }}>
                  Micro-Chapter {currentChapter.chapterIndex + 1} of {sessionData.totalChaptersCount}
                </span>
                <span style={{ fontSize: 11, color: "#94A3B8" }}>
                  {currentChapter.difficulty} Level
                </span>
              </div>

              <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px", color: "#FFFFFF" }}>
                {currentChapter.title}
              </h2>

              <p style={{ fontSize: 13, color: "#CBD5E1", margin: 0, lineHeight: 1.5 }}>
                {currentChapter.shortExplanation}
              </p>

              {/* Key Concept Badges */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {currentChapter.keyConcepts?.map((kc, idx) => (
                  <span key={idx} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "#1E293B", color: "#93C5FD", border: "1px solid #334155" }}>
                    🏷️ {kc}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Micro-Chapter Navigation Timeline */}
        <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-faint)", marginBottom: 10 }}>
            Concept Timeline & Micro-Chapters
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessionData.chapters?.map((ch, idx) => {
              const isCurrent = idx === currentChapterIdx;
              const isCompleted = ch.status === "completed";

              return (
                <div
                  key={ch.id}
                  onClick={() => handleJumpToChapter(idx)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: isCurrent ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                    background: isCurrent ? "var(--marigold-light)" : "var(--surface-2)",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all .15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: isCompleted ? "#059669" : isCurrent ? "var(--marigold-dark)" : "var(--ink-faint)" }}>
                      {isCompleted ? "✓" : isCurrent ? "●" : "○"}
                    </span>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: isCurrent ? 700 : 600, color: isCurrent ? "var(--marigold-dark)" : "var(--ink)" }}>
                        {ch.title}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
                        {ch.learningObjective}
                      </div>
                    </div>
                  </div>

                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-faint)", whiteSpace: "nowrap" }}>
                    {Math.round(ch.durationSeconds / 60)} min
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Recall Checkpoint Drawer */}
        {currentChapter && (
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 12, padding: 16, boxShadow: "var(--sh-sm)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>💡</span>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
                Active Recall Checkpoint
              </h3>
            </div>

            <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 0, marginBottom: 12 }}>
              Before proceeding to the quiz, explain the core idea of <b>{currentChapter.title}</b> in your own words.
            </p>

            <form onSubmit={handleActiveRecallSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <textarea
                value={recallInput}
                onChange={(e) => setRecallInput(e.target.value)}
                placeholder="Explain the main mechanism, formula, or key principle you just learned..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  fontSize: 13.5,
                  background: "var(--surface-2)",
                  color: "var(--ink)",
                }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                  AI evaluates concept understanding & missing points
                </span>

                <button
                  type="submit"
                  disabled={recallEvaluating || !recallInput.trim()}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: recallEvaluating || !recallInput.trim() ? "var(--line)" : "var(--p-gradient)",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: recallEvaluating || !recallInput.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {recallEvaluating ? "Evaluating…" : "Submit & Evaluate Recall →"}
                </button>
              </div>
            </form>

            {/* AI Active Recall Evaluation Feedback */}
            {recallResult && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-soft)" }}>
                    AI Understanding Score
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: recallResult.understandingScore >= 70 ? "#059669" : "#D97706" }}>
                    {recallResult.understandingScore} / 100
                  </span>
                </div>

                <div style={{ fontSize: 13, color: "var(--ink)", background: "var(--marigold-light)", padding: 12, borderRadius: 8, marginBottom: 10 }}>
                  💡 <b>AI Recommendation:</b> {recallResult.recommendation}
                </div>

                {recallResult.understoodConcepts?.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#059669" }}>✓ Concepts Understood: </span>
                    <span style={{ fontSize: 12, color: "var(--ink)" }}>{recallResult.understoodConcepts.join(", ")}</span>
                  </div>
                )}

                {recallResult.missingConcepts?.length > 0 && (
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#DC2626" }}>⚠️ Missing Key Points: </span>
                    <span style={{ fontSize: 12, color: "var(--ink)" }}>{recallResult.missingConcepts.join(", ")}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Adaptive Mini Quiz Section */}
        {currentChapter && currentChapter.questions?.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 12, padding: 16, boxShadow: "var(--sh-sm)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-faint)", marginBottom: 12 }}>
              Micro-Chapter Adaptive Mini Quiz ({currentChapter.questions.length} Questions)
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {currentChapter.questions.map((q, qIdx) => {
                const res = quizResults[q.id];
                const busy = quizBusy[q.id];

                return (
                  <div key={q.id} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--marigold-dark)", marginBottom: 4 }}>
                      Question {qIdx + 1} · {q.conceptTag}
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 10, lineHeight: 1.4 }}>
                      {q.questionText}
                    </div>

                    {/* Options */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                      {q.options?.map((opt, optIdx) => {
                        const isSelected = quizAnswers[q.id] === opt;
                        return (
                          <button
                            key={optIdx}
                            onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                            disabled={Boolean(res)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: isSelected ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                              background: isSelected ? "var(--marigold-light)" : "var(--surface)",
                              color: isSelected ? "var(--marigold-dark)" : "var(--ink)",
                              fontSize: 13,
                              fontWeight: isSelected ? 700 : 500,
                              textAlign: "left",
                              cursor: res ? "default" : "pointer",
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    {!res && (
                      <button
                        onClick={() => handleQuizAnswerSubmit(q.id, quizAnswers[q.id])}
                        disabled={busy || !quizAnswers[q.id]}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 6,
                          border: "none",
                          background: busy || !quizAnswers[q.id] ? "var(--line)" : "var(--p-gradient)",
                          color: "#ffffff",
                          fontSize: 12.5,
                          fontWeight: 700,
                          cursor: busy || !quizAnswers[q.id] ? "not-allowed" : "pointer",
                        }}
                      >
                        {busy ? "Checking…" : "Submit Answer"}
                      </button>
                    )}

                    {/* Result Feedback */}
                    {res && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)", fontSize: 12.5 }}>
                        <div style={{ fontWeight: 700, color: res.isCorrect ? "#059669" : "#DC2626", marginBottom: 2 }}>
                          {res.isCorrect ? "✓ Correct Answer!" : "✕ Incorrect Answer"}
                        </div>
                        <div style={{ color: "var(--ink-soft)" }}>{res.explanation}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Concept Mastery & Weak-Area Insights Panel */}
        {sessionData.conceptMastery?.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-faint)", marginBottom: 10 }}>
              Weak-Area Detection & Concept Mastery Breakdown
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {sessionData.conceptMastery.map((cm, idx) => {
                const isMastered = cm.status === "Mastered";
                const isNeedsReview = cm.status === "Needs Review";

                return (
                  <div
                    key={idx}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid var(--line)",
                      background: isMastered ? "#ECFDF5" : isNeedsReview ? "#FEF2F2" : "var(--surface-2)",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{cm.conceptName}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: isMastered ? "#10B981" : isNeedsReview ? "#EF4444" : "#F59E0B",
                          color: "#ffffff",
                        }}
                      >
                        {cm.status}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)" }}>
                        {cm.masteryScore}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Interactive SVG Dynamic Mind Map Component ────────────── */
function MindMapGraph({ nodes, title }) {
  if (!nodes || nodes.length === 0) return null;

  return (
    <div style={{ background: "#0F172A", border: "1px solid #1E293B", borderRadius: 12, padding: 16, marginBottom: 16, color: "#F8FAFC" }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#F59E0B", marginBottom: 10 }}>
        🧠 Dynamic Concept Mind Map Graph
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, overflowX: "auto", padding: 10 }}>
        {nodes.map((node) => {
          const isMastered = node.masteryStatus === "Mastered";
          const isNeedsReview = node.masteryStatus === "Needs Review";
          const indent = (node.depth || 0) * 24;

          return (
            <div
              key={node.id}
              style={{
                marginLeft: indent,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: isMastered ? "#064E3B" : isNeedsReview ? "#7F1D1D" : "#1E293B",
                color: "#F8FAFC",
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                maxWidth: 320,
              }}
            >
              <span>{node.depth === 0 ? "🎯" : "🔹"}</span>
              <span style={{ flex: 1 }}>{node.label}</span>
              <span style={{ fontSize: 10, opacity: 0.8, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.1)" }}>
                {node.masteryStatus}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
