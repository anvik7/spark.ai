import React, { useState, useEffect } from "react";
import { api } from "./api.js";

export default function StudyActiveSession({ sessionId, onBack, onOpenUpgrade }) {
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  
  // Navigation state
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);

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
    setErr("");
    try {
      const data = await api.getActiveStudySession(sessionId);
      setSessionData(data);
      setCurrentChapterIdx(data.currentChapterIndex || 0);

      // Load MindMap
      api.getStudyMindMap(sessionId)
        .then((mm) => setMindmapNodes(Array.isArray(mm) ? mm : []))
        .catch(() => {});
    } catch (e) {
      setErr("Study couldn't load right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const currentChapter = sessionData?.chapters?.[currentChapterIdx] || null;

  const handleJumpToChapter = (idx) => {
    if (!sessionData?.chapters?.[idx]) return;
    const targetCh = sessionData.chapters[idx];
    setCurrentChapterIdx(idx);
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

      // Reload session details to update concept mastery breakdown
      api.getStudyMindMap(sessionId).then((mm) => setMindmapNodes(Array.isArray(mm) ? mm : [])).catch(() => {});
      const updated = await api.getActiveStudySession(sessionId);
      setSessionData((prev) => ({
        ...prev,
        overallMasteryPercent: updated.overallMasteryPercent,
        conceptMastery: updated.conceptMastery,
      }));
    } catch (e) {
      setErr("Study couldn't load right now.");
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
      setErr("Study couldn't load right now.");
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

  if (err || !sessionData || sessionData.processingStatus === "FAILED") {
    return (
      <div className="screen" style={{ padding: 20 }}>
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
            marginBottom: 16,
          }}
        >
          ← Back to Sessions
        </button>
        <div
          style={{
            padding: 20,
            background: "var(--surface)",
            border: "1.5px solid var(--line)",
            borderRadius: 12,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
            Study couldn't load right now.
          </div>
          <button
            onClick={loadSession}
            style={{
              padding: "8px 18px",
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
          Active Learning Session
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
        {/* Study Material Summary Header */}
        <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 14, padding: 18, boxShadow: "var(--sh-sm)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 24, padding: 10, borderRadius: 10, background: "var(--surface-2)" }}>📄</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {sessionData.title}
              </h2>
              <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
                {sessionData.totalChaptersCount || 0} Concept Chapters
              </div>
            </div>
          </div>

          {/* Current Micro-Chapter Header Bar */}
          {currentChapter && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--marigold-dark)", textTransform: "uppercase" }}>
                  Concept Chapter {currentChapter.chapterIndex + 1} of {sessionData.totalChaptersCount}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600 }}>
                  {currentChapter.difficulty} Level
                </span>
              </div>

              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>
                {currentChapter.title}
              </h3>

              <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: 0, lineHeight: 1.5 }}>
                {currentChapter.shortExplanation}
              </p>

              {/* Key Concept Badges */}
              {currentChapter.keyConcepts?.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {currentChapter.keyConcepts.map((kc, idx) => (
                    <span key={idx} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--line)" }}>
                      🏷️ {kc}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Concept Chapters Timeline */}
        <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-faint)", marginBottom: 10 }}>
            Concept Timeline & Chapters
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

        {/* Final Mastery Check Assessment (when all chapters are reviewed) */}
        {currentChapterIdx === sessionData.chapters.length - 1 && (
          <div
            style={{
              background: "var(--surface)",
              border: "2px solid var(--marigold)",
              borderRadius: 14,
              padding: 20,
              boxShadow: "var(--sh-md)",
              marginBottom: 16,
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 32 }}>🏆</span>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: "6px 0 2px", color: "var(--ink)" }}>
                Final Mastery Assessment
              </h3>
              <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                Source-grounded evaluation across all concepts in this session
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 14, background: "var(--surface-2)", borderRadius: 10, textAlign: "center", border: "1px solid var(--line)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-soft)" }}>Final Mastery</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: sessionData.overallMasteryPercent >= 70 ? "#059669" : "#D97706", marginTop: 2 }}>
                  {Math.round(sessionData.overallMasteryPercent || 0)}%
                </div>
              </div>

              <div style={{ padding: 14, background: "var(--surface-2)", borderRadius: 10, textAlign: "center", border: "1px solid var(--line)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-soft)" }}>Concepts Mastered</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                  {sessionData.conceptMastery?.filter((c) => c.status === "Mastered")?.length || 0} / {sessionData.conceptMastery?.length || sessionData.totalChaptersCount}
                </div>
              </div>
            </div>

            {/* Strong Areas & Needs Review Lists */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <div style={{ padding: 12, background: "#ECFDF5", borderRadius: 8, border: "1px solid #A7F3D0" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#059669", marginBottom: 6 }}>
                  ✓ Strong Areas
                </div>
                <div style={{ fontSize: 12, color: "var(--ink)" }}>
                  {sessionData.conceptMastery?.filter((c) => c.status === "Mastered" || c.masteryScore >= 70)?.map((c) => c.conceptName)?.join(", ") || "Completing recall & quizzes..."}
                </div>
              </div>

              <div style={{ padding: 12, background: "#FEF2F2", borderRadius: 8, border: "1px solid #FCA5A5" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>
                  ⚠️ Needs Review
                </div>
                <div style={{ fontSize: 12, color: "var(--ink)" }}>
                  {sessionData.conceptMastery?.filter((c) => c.status === "Needs Review" || (c.attemptsCount > 0 && c.masteryScore < 70))?.map((c) => c.conceptName)?.join(", ") || "None! All concepts strong."}
                </div>
              </div>
            </div>

            {/* Assessment Action Controls */}
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => {
                  const weakIdx = sessionData.chapters.findIndex((ch) =>
                    sessionData.conceptMastery?.some((cm) => cm.conceptName === ch.title && cm.status === "Needs Review")
                  );
                  if (weakIdx !== -1) handleJumpToChapter(weakIdx);
                  else handleJumpToChapter(0);
                }}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: "1px solid var(--marigold)",
                  background: "var(--marigold-light)",
                  color: "var(--marigold-dark)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Review Weak Areas
              </button>

              <button
                onClick={onBack}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--p-gradient)",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Finish Session
              </button>
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
                let statusLabel = cm.status || "Learning";
                let badgeColor = "#0284C7";
                let badgeBg = "#E0F2FE";
                let cardBg = "var(--surface-2)";
                let borderCol = "var(--line)";

                if (statusLabel === "Mastered") {
                  badgeColor = "#059669";
                  badgeBg = "#D1FAE5";
                  cardBg = "#ECFDF5";
                  borderCol = "#A7F3D0";
                } else if (statusLabel === "Improving") {
                  badgeColor = "#D97706";
                  badgeBg = "#FEF3C7";
                  cardBg = "#FFFBEB";
                  borderCol = "#FDE68A";
                } else if (statusLabel === "Needs Review") {
                  badgeColor = "#DC2626";
                  badgeBg = "#FEE2E2";
                  cardBg = "#FEF2F2";
                  borderCol = "#FCA5A5";
                } else {
                  // Learning
                  badgeColor = "#0284C7";
                  badgeBg = "#E0F2FE";
                  cardBg = "#F0F9FF";
                  borderCol = "#BAE6FD";
                }

                return (
                  <div
                    key={idx}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: `1px solid ${borderCol}`,
                      background: cardBg,
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
                          background: badgeBg,
                          color: badgeColor,
                        }}
                      >
                        {statusLabel}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)" }}>
                        {Math.round(cm.masteryScore || 0)}%
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
