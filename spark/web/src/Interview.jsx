import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api.js";

const scoreColor = (s) =>
  s >= 80 ? "#10B981" : s >= 65 ? "var(--marigold)" : "#EF4444";

function Ring({ score }) {
  const r = 44,
    c = 2 * Math.PI * r,
    off = c * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <svg viewBox="0 0 110 110" style={{ width: 110, height: 110 }}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle
        cx="55"
        cy="55"
        r={r}
        fill="none"
        stroke={scoreColor(score)}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 55 55)"
        style={{ transition: "stroke-dashoffset .8s ease" }}
      />
      <text
        x="55"
        y="52"
        textAnchor="middle"
        fontFamily="var(--display)"
        fontSize="24"
        fontWeight="600"
        fill="var(--ink)"
      >
        {score}
      </text>
      <text
        x="55"
        y="68"
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="9"
        fill="var(--ink-faint)"
      >
        / 100
      </text>
    </svg>
  );
}

// ── Voice: Web Speech Recognition & Web Speech Synthesis (TTS) ──────
const SPEECH_REC_OK =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

const SPEECH_SYNTH_OK =
  typeof window !== "undefined" && "speechSynthesis" in window;

function speakText(text) {
  if (!SPEECH_SYNTH_OK || !text) return;
  try {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.0;
    utt.pitch = 1.0;
    window.speechSynthesis.speak(utt);
  } catch (e) {
    console.error("TTS error:", e);
  }
}

export default function Interview({ onNavigate, user }) {
  const [targetRole, setTargetRole] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [roundType, setRoundType] = useState("Technical Deep-Dive");
  const [difficulty, setDifficulty] = useState("Medium");

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [answerInput, setAnswerInput] = useState("");

  const [session, setSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [err, setErr] = useState("");

  const recRef = useRef(null);

  // Auto-load career profile resume & active interview session on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getInterviewSession().catch(() => null),
      api.getCareerProfile().catch(() => null),
      api.getInterviewHistory().catch(() => []),
    ])
      .then(([activeSess, profile, hist]) => {
        if (activeSess) setSession(activeSess);
        if (Array.isArray(hist)) setHistory(hist);
        if (profile) {
          if (profile.target_role && !targetRole) setTargetRole(profile.target_role);
          if (profile.target_company && !targetCompany) setTargetCompany(profile.target_company);
          if (profile.job_description && !jobDescription) setJobDescription(profile.job_description);
          if (profile.resume_text && !resumeText) setResumeText(profile.resume_text);
        }
      })
      .catch((e) => console.error("Failed to load interview context:", e))
      .finally(() => setLoading(false));
  }, []);

  // Speak interviewer question when TTS is enabled
  useEffect(() => {
    if (voiceEnabled && session && session.status === "active" && session.turns?.length > 0) {
      const lastTurn = session.turns[session.turns.length - 1];
      if (lastTurn && lastTurn.q && !lastTurn.a) {
        speakText(lastTurn.q);
      }
    }
  }, [voiceEnabled, session]);

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      recRef.current = null;
      setListening(false);
      setInterimText("");
      return;
    }

    if (!SPEECH_REC_OK) {
      setErr("Speech recognition requires Chrome or Edge browser.");
      return;
    }

    try {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new R();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-IN";

      rec.onresult = (e) => {
        let inter = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            const txt = r[0].transcript.trim();
            setAnswerInput((prev) => (prev ? prev.trim() + " " + txt : txt));
          } else {
            inter += r[0].transcript;
          }
        }
        setInterimText(inter);
      };

      rec.onend = () => {
        setListening(false);
        setInterimText("");
      };
      rec.onerror = (e) => {
        console.error("Speech rec error:", e.error);
        setListening(false);
        setInterimText("");
        setErr("Microphone access error. Check browser permissions.");
      };

      rec.start();
      recRef.current = rec;
      setListening(true);
      setErr("");
    } catch (e) {
      console.error("Mic start error:", e);
      setErr("Could not access microphone.");
    }
  };

  const handleStartInterview = async (e) => {
    e?.preventDefault();
    if (!targetRole.trim()) {
      setErr("Please specify your target role.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const newSess = await api.startInterview({
        target_role: targetRole,
        target_company: targetCompany,
        job_description: jobDescription,
        resume_text: resumeText,
        round_type: roundType,
        difficulty: difficulty,
      });
      setSession(newSess);
      setAnswerInput("");
    } catch (error) {
      console.error("Start interview error:", error);
      setErr(error.message || "Failed to start interview session.");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitAnswer = async (e) => {
    e?.preventDefault();
    const ans = answerInput.trim();
    if (!ans || !session) return;

    if (listening) {
      recRef.current?.stop();
      setListening(false);
    }

    setBusy(true);
    setErr("");
    try {
      const updatedSess = await api.answerInterview(session.id, ans);
      setSession(updatedSess);
      setAnswerInput("");
    } catch (error) {
      console.error("Submit answer error:", error);
      setErr(error.message || "Failed to submit answer.");
    } finally {
      setBusy(false);
    }
  };

  const handleConcludeInterview = async () => {
    if (!session) return;
    setEvaluating(true);
    setErr("");
    try {
      const evalSess = await api.evaluateInterview(session.id);
      setSession(evalSess);
      setHistory((prev) => [evalSess, ...prev.filter((h) => h.id !== evalSess.id)]);
    } catch (error) {
      console.error("Evaluate error:", error);
      setErr(error.message || "Failed to evaluate interview.");
    } finally {
      setEvaluating(false);
    }
  };

  const handleNewInterview = () => {
    setSession(null);
    setAnswerInput("");
    setErr("");
  };

  if (loading) {
    return (
      <div className="screen" style={{ textAlign: "center", padding: 60, color: "var(--ink-soft)" }}>
        <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading AI Coach & Interview Engine…
      </div>
    );
  }

  const currentTurn = session?.turns?.[session.turns.length - 1];
  const isSessionActive = session && session.status === "active";
  const isSessionCompleted = session && session.status === "completed" && session.evaluation;

  return (
    <div className="screen">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ color: "var(--marigold-dark)" }}>AI Interview & Executive Coach</div>
        <h1 className="title" style={{ fontSize: 26, margin: 0 }}>Candidate Interview Simulator</h1>
        <p className="sub" style={{ margin: "4px 0 0", fontSize: 14 }}>
          Spark AI analyzes your candidate resume, investigates specific project claims & metrics, adapts difficulty dynamically, and generates multi-metric scorecard feedback.
        </p>
      </div>

      {/* ── SCREEN 1: Setup Form (When no active/completed session selected) ── */}
      {!session && (
        <div>
          <form
            onSubmit={handleStartInterview}
            style={{
              background: "var(--surface)",
              border: "1.5px solid var(--line)",
              borderRadius: "var(--r)",
              padding: 20,
              boxShadow: "var(--sh-sm)",
              marginBottom: 24,
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 14px", color: "var(--ink)" }}>Setup Interview Context</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Target Role / Title *</label>
                <input
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. AI Engineer, Product Manager, Administrative Assistant"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 14 }}
                />
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Target Company (Optional)</label>
                <input
                  value={targetCompany}
                  onChange={(e) => setTargetCompany(e.target.value)}
                  placeholder="e.g. Razorpay, Google, Microsoft"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 14 }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Interview Round</label>
                <select
                  value={roundType}
                  onChange={(e) => setRoundType(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 14 }}
                >
                  <option value="HR Screen">HR / Behavioral Screen</option>
                  <option value="Technical Deep-Dive">Technical Deep-Dive</option>
                  <option value="Hiring Manager">Hiring Manager / Ownership</option>
                </select>
              </div>

              <div className="field">
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Initial Difficulty</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 14 }}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Target Job Description (Optional)</label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={3}
                placeholder="Paste key responsibilities or required qualifications..."
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13.5, resize: "vertical", fontFamily: "var(--sans)" }}
              />
            </div>

            <div className="field" style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Candidate Resume Context</label>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={5}
                placeholder="Paste your resume text (education, technical skills, project metrics, employment history)..."
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13.5, resize: "vertical", fontFamily: "var(--sans)" }}
              />
            </div>

            {err && <div className="err" style={{ marginBottom: 14 }}>{err}</div>}

            <button
              type="submit"
              disabled={busy || !targetRole.trim()}
              style={{
                width: "100%",
                padding: "12px 24px",
                borderRadius: "var(--r-s)",
                border: "none",
                background: busy || !targetRole.trim() ? "var(--line)" : "var(--p-gradient)",
                color: "#FFFFFF",
                fontSize: 15,
                fontWeight: 700,
                cursor: busy || !targetRole.trim() ? "not-allowed" : "pointer",
                boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
              }}
            >
              {busy ? "Analyzing Resume & Opening Question…" : "Start Dynamic AI Interview →"}
            </button>
          </form>

          {/* Past Interview History */}
          {history.length > 0 && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px", color: "var(--ink)" }}>Previous Interview Scorecards</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {history.map((h) => (
                  <div
                    key={h.id}
                    onClick={() => setSession(h)}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--line)",
                      padding: 14,
                      borderRadius: 10,
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                        {h.target_role} {h.target_company ? `at ${h.target_company}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
                        {h.round_type} · {new Date(h.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </div>
                    </div>
                    {h.evaluation?.overall_score && (
                      <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor(h.evaluation.overall_score), background: "var(--surface-2)", padding: "4px 10px", borderRadius: 12, border: "1px solid var(--line)" }}>
                        {h.evaluation.overall_score} / 100
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SCREEN 2: Live Interactive Interview Conversation ── */}
      {isSessionActive && (
        <div>
          {/* Header Status Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: "var(--marigold-light)", color: "var(--marigold-dark)" }}>
                {session.round_type}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink-soft)" }}>
                Difficulty: {session.difficulty}
              </span>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: 12,
                  border: voiceEnabled ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                  background: voiceEnabled ? "var(--marigold-light)" : "var(--surface-2)",
                  color: voiceEnabled ? "var(--marigold-dark)" : "var(--ink-soft)",
                  cursor: "pointer",
                }}
              >
                {voiceEnabled ? "🔊 Voice TTS On" : "🔈 Voice TTS Off"}
              </button>

              <button
                type="button"
                onClick={handleConcludeInterview}
                disabled={evaluating}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "4px 12px",
                  borderRadius: 12,
                  border: "none",
                  background: "#DC2626",
                  color: "#fff",
                  cursor: evaluating ? "not-allowed" : "pointer",
                }}
              >
                {evaluating ? "Evaluating Transcript…" : "Conclude & Score →"}
              </button>
            </div>
          </div>

          {/* Turn History Transcript */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
            {session.turns?.map((turn, idx) => (
              <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Interviewer Question Card */}
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1.5px solid var(--line)",
                    borderRadius: "var(--r)",
                    padding: 16,
                    boxShadow: "var(--sh-sm)",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--marigold-dark)", marginBottom: 4 }}>
                    AI Interviewer Question #{idx + 1}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", lineHeight: 1.5 }}>
                    {turn.q}
                  </div>
                </div>

                {/* Candidate Answer Card */}
                {turn.a && (
                  <div
                    style={{
                      alignSelf: "flex-end",
                      maxWidth: "90%",
                      background: "var(--surface-2)",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--r)",
                      padding: 14,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 2 }}>
                      Your Answer
                    </div>
                    <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                      {turn.a}
                    </div>

                    {turn.feedback && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line)", fontSize: 12, color: "#059669", background: "#ECFDF5", padding: "6px 10px", borderRadius: 6 }}>
                        <b>✓ Recruiter Note:</b> {turn.feedback}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Current Question Answer Input Form */}
          {currentTurn && !currentTurn.a && (
            <form
              onSubmit={handleSubmitAnswer}
              style={{
                background: "var(--surface)",
                border: "1.5px solid var(--line)",
                borderRadius: "var(--r)",
                padding: 16,
                boxShadow: "var(--sh)",
              }}
            >
              <textarea
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                rows={4}
                placeholder="Type or speak your answer... Be specific with baseline metrics, tools, trade-offs, and concrete project details."
                style={{
                  width: "100%",
                  border: "none",
                  outline: "none",
                  fontSize: 14.5,
                  lineHeight: 1.6,
                  fontFamily: "var(--sans)",
                  background: "transparent",
                  resize: "vertical",
                  color: "var(--ink)",
                }}
              />

              {listening && (
                <div style={{ padding: "6px 10px", background: "var(--marigold-light)", borderRadius: 8, fontSize: 13, color: "var(--marigold-dark)", marginBottom: 10 }}>
                  🎙️ Recording speech: <i>{interimText || "speak your answer…"}</i>
                </div>
              )}

              {err && <div className="err" style={{ marginBottom: 10, fontSize: 13 }}>{err}</div>}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                <button
                  type="button"
                  onClick={toggleMic}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 16,
                    border: listening ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                    background: listening ? "var(--marigold-light)" : "var(--surface-2)",
                    fontSize: 13,
                    fontWeight: listening ? 700 : 500,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: listening ? "var(--marigold-dark)" : "var(--ink-soft)",
                  }}
                >
                  <span>🎙️</span>
                  <span>{listening ? "Recording Speech…" : "Voice Input"}</span>
                </button>

                <button
                  type="submit"
                  disabled={busy || !answerInput.trim()}
                  style={{
                    padding: "9px 20px",
                    borderRadius: "var(--r-s)",
                    border: "none",
                    background: busy || !answerInput.trim() ? "var(--line)" : "var(--p-gradient)",
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: busy || !answerInput.trim() ? "not-allowed" : "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                  }}
                >
                  {busy ? "Evaluating Answer…" : "Submit Answer →"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── SCREEN 3: Completed Candidate Evaluation Scorecard ── */}
      {isSessionCompleted && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <button
              onClick={handleNewInterview}
              style={{ padding: "6px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              ← Start New Interview
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#059669", background: "#ECFDF5", padding: "4px 12px", borderRadius: 12, border: "1px solid #A7F3D0" }}>
              Verdict: {session.evaluation.verdict || "Hire"}
            </span>
          </div>

          {/* Overall Score Card */}
          <div
            style={{
              background: "var(--surface)",
              border: "1.5px solid var(--line)",
              borderRadius: "var(--r-l)",
              padding: 20,
              marginBottom: 20,
              boxShadow: "var(--sh)",
              display: "flex",
              alignItems: "center",
              gap: 20,
            }}
          >
            <Ring score={session.evaluation.overall_score || 0} />
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ margin: 0, color: "var(--marigold-dark)" }}>Hiring Committee Evaluation</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "2px 0 6px", color: "var(--ink)" }}>
                {session.target_role} {session.target_company ? `at ${session.target_company}` : ""}
              </h2>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                {session.evaluation.summary}
              </p>
            </div>
          </div>

          {/* Metric Ratings Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Technical Depth", val: session.evaluation.technical_depth },
              { label: "Communication", val: session.evaluation.communication },
              { label: "Problem Solving", val: session.evaluation.problem_solving },
              { label: "Role Relevance", val: session.evaluation.role_relevance },
              { label: "Specificity / Evidence", val: session.evaluation.specificity_evidence },
            ].map((m) => (
              <div key={m.label} style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: 12, borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase" }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor(m.val || 0), marginTop: 2 }}>{m.val || 0} / 100</div>
              </div>
            ))}
          </div>

          {/* Strengths & Weaknesses */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: "var(--r)", padding: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#059669", display: "block", marginBottom: 6 }}>
                ✓ Demonstrated Strengths
              </span>
              {session.evaluation.strengths?.map((str, idx) => (
                <div key={idx} style={{ fontSize: 13, color: "var(--ink)", margin: "4px 0" }}>• {str}</div>
              ))}
            </div>

            <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: "var(--r)", padding: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#D97706", display: "block", marginBottom: 6 }}>
                ⚠ Missed Opportunities & Weaknesses
              </span>
              {session.evaluation.weaknesses?.map((w, idx) => (
                <div key={idx} style={{ fontSize: 13, color: "var(--ink)", margin: "4px 0" }}>• {w}</div>
              ))}
            </div>
          </div>

          {/* Recommended Practice Areas */}
          {session.evaluation.practice_areas?.length > 0 && (
            <div style={{ background: "var(--surface)", border: "1.5px solid var(--line)", borderRadius: "var(--r)", padding: 16, marginBottom: 20 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--marigold-dark)", display: "block", marginBottom: 6 }}>
                🎯 Recommended Practice Areas
              </span>
              {session.evaluation.practice_areas.map((p, idx) => (
                <div key={idx} style={{ fontSize: 13, color: "var(--ink)", margin: "4px 0" }}>• {p}</div>
              ))}
            </div>
          )}

          {/* Full Interview Transcript Drawer */}
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r)", padding: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", color: "var(--ink)" }}>Full Interview Transcript</h3>
            {session.turns?.map((turn, idx) => (
              <div key={idx} style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--marigold-dark)" }}>Q{idx + 1}: {turn.q}</div>
                <div style={{ fontSize: 13, color: "var(--ink)", marginTop: 4 }}><b>Candidate:</b> {turn.a}</div>
                {turn.feedback && <div style={{ fontSize: 12, color: "#059669", marginTop: 2 }}><b>Feedback:</b> {turn.feedback}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
