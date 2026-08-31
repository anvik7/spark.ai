import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api.js";
import { createInterviewController } from "./utils/interviewController.js";
import { createSpeechRecognitionManager } from "./utils/speechRecognition.js";

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

export default function Interview({ onNavigate, user }) {
  // Context setup
  const [targetRole, setTargetRole] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [roundType, setRoundType] = useState("Technical Deep-Dive");
  const [difficulty, setDifficulty] = useState("Medium");

  // Voice & Controller states
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [controller, setController] = useState(null);
  const [status, setStatus] = useState("idle"); // "idle" | "speaking" | "listening" | "thinking" | "completed"
  const [currentQuestion, setCurrentQuestion] = useState("");

  // Candidate input
  const [answerInput, setAnswerInput] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isMicActive, setIsMicActive] = useState(false);

  // DB Sessions & History
  const [session, setSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sttManagerRef = useRef(null);

  // Speech Recognition Manager
  useEffect(() => {
    sttManagerRef.current = createSpeechRecognitionManager({
      lang: "en-US",
      maxSilenceMs: 2500,
    });
  }, []);

  // Load existing career profile resume & past interview sessions
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getInterviewSession().catch(() => null),
      api.getCareerProfile().catch(() => null),
      api.getInterviewHistory().catch(() => []),
    ])
      .then(([activeSess, profile, hist]) => {
        if (activeSess) {
          setSession(activeSess);
          if (activeSess.status === "completed") {
            setStatus("completed");
          }
        }
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

  // Initialize Interview Controller
  const initController = useCallback(
    (roleVal, companyVal, jdVal, resumeVal, roundVal, diffVal) => {
      const ctrl = createInterviewController({
        targetRole: roleVal || targetRole,
        company: companyVal || targetCompany,
        jobDescription: jdVal || jobDescription,
        candidateProfile: resumeVal || resumeText,
        interviewRound: roundVal || roundType,
        difficulty: diffVal || difficulty,
        aiStartInterview: (data) => api.startInterview(data),
        aiAnswerInterview: (sessId, text) => api.answerInterview(sessId, text),
        aiEvaluateInterview: (sessId) => api.evaluateInterview(sessId),
        ui: {
          onStatusChange: (s) => setStatus(s),
          onInterviewerSpeaking: (q) => {
            setCurrentQuestion(q);
            setInterimTranscript("");
          },
          onCandidateListening: () => {
            if (voiceEnabled && sttManagerRef.current?.isSupported) {
              startListeningMic();
            }
          },
          onCandidateTranscribed: (ans) => {
            setAnswerInput("");
            setInterimTranscript("");
          },
          onInterviewCompleted: (evalSess) => {
            setSession(evalSess);
            setStatus("completed");
            setHistory((prev) => [evalSess, ...prev.filter((h) => h.id !== evalSess.id)]);
          },
          onError: (e) => setErr(e.message || "Interview error occurred."),
        },
      });
      setController(ctrl);
      return ctrl;
    },
    [targetRole, targetCompany, jobDescription, resumeText, roundType, difficulty, voiceEnabled]
  );

  const startListeningMic = () => {
    if (!sttManagerRef.current?.isSupported) return;
    setIsMicActive(true);
    sttManagerRef.current.startListening({
      onResult: ({ interim, final }) => {
        setInterimTranscript(interim);
        if (final) {
          setAnswerInput((prev) => (prev ? prev.trim() + " " + final : final));
        }
      },
      onFinal: (final) => {
        if (final) {
          setAnswerInput((prev) => (prev ? prev.trim() + " " + final : final));
        }
      },
      onError: (e) => console.warn("Mic error:", e),
      onEnd: () => setIsMicActive(false),
    });
  };

  const stopListeningMic = () => {
    sttManagerRef.current?.stopListening();
    setIsMicActive(false);
  };

  // Handlers
  const handleStartInterview = async (e) => {
    e?.preventDefault();
    if (!targetRole.trim()) {
      setErr("Please specify your target role.");
      return;
    }

    setBusy(true);
    setErr("");

    try {
      const ctrl = initController(targetRole, targetCompany, jobDescription, resumeText, roundType, difficulty);
      await ctrl.start();
      const st = ctrl.getState();
      if (st.session) setSession(st.session);
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
    if (!ans) {
      setErr("Please provide an answer to submit.");
      return;
    }

    stopListeningMic();
    setBusy(true);
    setErr("");

    try {
      if (controller) {
        await controller.submitAnswer(ans);
        const st = controller.getState();
        if (st.session) setSession(st.session);
      } else if (session) {
        setStatus("thinking");
        const updatedSess = await api.answerInterview(session.id, ans);
        setSession(updatedSess);
        setAnswerInput("");
        if (updatedSess.status === "completed") {
          setStatus("completed");
        } else {
          setStatus("speaking");
          const turns = updatedSess.turns || [];
          const lastTurn = turns[turns.length - 1];
          if (lastTurn?.q) setCurrentQuestion(lastTurn.q);
        }
      }
    } catch (error) {
      console.error("Submit answer error:", error);
      setErr(error.message || "Failed to submit answer.");
    } finally {
      setBusy(false);
    }
  };

  const handleConcludeInterview = async () => {
    stopListeningMic();
    if (controller) {
      controller.conclude();
    } else if (session) {
      setBusy(true);
      try {
        const evalSess = await api.evaluateInterview(session.id);
        setSession(evalSess);
        setStatus("completed");
        setHistory((prev) => [evalSess, ...prev.filter((h) => h.id !== evalSess.id)]);
      } catch (error) {
        console.error("Evaluate error:", error);
        setErr(error.message || "Failed to evaluate interview.");
      } finally {
        setBusy(false);
      }
    }
  };

  const handleNewInterview = () => {
    if (controller) controller.stopAll();
    stopListeningMic();
    setSession(null);
    setStatus("idle");
    setCurrentQuestion("");
    setAnswerInput("");
    setErr("");
  };

  return (
    <div className="screen">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Interview Coach</h1>
        <p className="sub" style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Practice technical and behavioral mock interviews with natural Web Speech voice and evaluation scorecards.
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--ink-soft)" }}>
          <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading active interview context…
        </div>
      )}

      {/* ── STEP 1: SETUP FORM (WHEN NO ACTIVE SESSION) ────────────────────────── */}
      {!loading && !session && (
        <form
          onSubmit={handleStartInterview}
          style={{
            background: "var(--surface)",
            border: "1.5px solid var(--line)",
            borderRadius: "var(--r)",
            padding: 20,
            boxShadow: "var(--sh)",
            maxWidth: 720,
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 14px", color: "var(--ink)" }}>
            Configure Interview Parameters
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4, color: "var(--ink-soft)" }}>
                Target Role *
              </label>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Senior Frontend Engineer, Product Manager"
                required
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4, color: "var(--ink-soft)" }}>
                Target Company
              </label>
              <input
                type="text"
                value={targetCompany}
                onChange={(e) => setTargetCompany(e.target.value)}
                placeholder="e.g. Google, Stripe, High-growth Startup"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14 }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4, color: "var(--ink-soft)" }}>
                Interview Round
              </label>
              <select
                value={roundType}
                onChange={(e) => setRoundType(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14, background: "var(--surface)" }}
              >
                <option value="HR Screening">HR Screening & Behavioral</option>
                <option value="Technical Deep-Dive">Technical Deep-Dive & Architecture</option>
                <option value="Hiring Manager">Hiring Manager & Leadership / Judgment</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4, color: "var(--ink-soft)" }}>
                Difficulty Level
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14, background: "var(--surface)" }}
              >
                <option value="Easy">Easy (Standard Entry-level)</option>
                <option value="Medium">Medium (Mid-level Standard)</option>
                <option value="Hard">Hard (Senior Probing)</option>
                <option value="Expert">Expert (Staff / Principal Leadership)</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4, color: "var(--ink-soft)" }}>
              Job Description (JD)
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste job description requirements, responsibilities, or tech stack..."
              rows={3}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, resize: "vertical" }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4, color: "var(--ink-soft)" }}>
              Candidate Resume / Background Profile
            </label>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your resume text, key achievements, or metrics..."
              rows={4}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, resize: "vertical" }}
            />
          </div>

          {err && <div className="err" style={{ marginBottom: 12, fontSize: 13 }}>{err}</div>}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
              />
              <span>🔊 Enable Natural Web Speech Voice Playback</span>
            </label>

            <button
              type="submit"
              disabled={busy || !targetRole.trim()}
              style={{
                padding: "10px 24px",
                borderRadius: "var(--r-s)",
                border: "none",
                background: busy || !targetRole.trim() ? "var(--line)" : "var(--p-gradient)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: busy || !targetRole.trim() ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Generating Opening Question…" : "Start AI Interview →"}
            </button>
          </div>
        </form>
      )}

      {/* ── STEP 2: ACTIVE INTERVIEW SESSION ────────────────────────────────────── */}
      {!loading && session && (
        <div style={{ maxWidth: 840, margin: "0 auto" }}>
          {/* Active Session Info Bar */}
          <div
            style={{
              background: "var(--surface)",
              border: "1.5px solid var(--line)",
              borderRadius: "var(--r)",
              padding: 16,
              marginBottom: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--marigold-dark)" }}>
                {session.round_type || roundType} · {session.difficulty || difficulty}
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
                {session.target_role} {session.target_company ? `at ${session.target_company}` : ""}
              </h2>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Voice Status Badge */}
              <div
                style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background:
                    status === "speaking"
                      ? "#EFF6FF"
                      : status === "listening"
                      ? "#ECFDF5"
                      : status === "thinking"
                      ? "var(--marigold-light)"
                      : "var(--surface-2)",
                  color:
                    status === "speaking"
                      ? "#2563EB"
                      : status === "listening"
                      ? "#059669"
                      : status === "thinking"
                      ? "var(--marigold-dark)"
                      : "var(--ink-soft)",
                  border: "1px solid var(--line)",
                }}
              >
                {status === "speaking" && <span>🔊 Interviewer Speaking…</span>}
                {status === "listening" && <span>🎙️ Candidate Turn (Listening)</span>}
                {status === "thinking" && <span>🧠 Evaluating Answer…</span>}
                {status === "completed" && <span>✅ Interview Concluded</span>}
                {status === "idle" && <span>⏸️ Ready</span>}
              </div>

              {session.status !== "completed" && (
                <button
                  onClick={handleConcludeInterview}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 12,
                    border: "1px solid var(--line)",
                    background: "var(--surface-2)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#DC2626",
                    cursor: "pointer",
                  }}
                >
                  Conclude Interview
                </button>
              )}

              <button
                onClick={handleNewInterview}
                style={{
                  padding: "6px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "var(--surface-2)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink-soft)",
                  cursor: "pointer",
                }}
              >
                + New Interview
              </button>
            </div>
          </div>

          {/* Voice Controls Toolbar */}
          {controller && session.status !== "completed" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => controller.tts.replay()}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                🔄 Replay Question Voice
              </button>
              <button
                onClick={() => controller.tts.pause()}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                ⏸️ Pause Voice
              </button>
              <button
                onClick={() => controller.tts.resume()}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                ▶️ Resume Voice
              </button>
              <button
                onClick={() => controller.tts.stop()}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                ⏹️ Stop Voice
              </button>
            </div>
          )}

          {/* Multi-Turn Conversation Thread */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
            {(session.turns || []).map((turn, idx) => (
              <div
                key={idx}
                style={{
                  background: "var(--surface)",
                  border: "1.5px solid var(--line)",
                  borderRadius: "var(--r)",
                  padding: 16,
                  boxShadow: "var(--sh-sm)",
                }}
              >
                {/* Interviewer Question */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--marigold-dark)", marginBottom: 4 }}>
                    Turn {idx + 1} · Interviewer Question
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", lineHeight: 1.5 }}>
                    {turn.q}
                  </div>
                </div>

                {/* Candidate Answer */}
                {turn.a ? (
                  <div style={{ background: "var(--surface-2)", padding: 12, borderRadius: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 4 }}>
                      Your Answer
                    </div>
                    <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5 }}>
                      {turn.a}
                    </div>
                  </div>
                ) : (
                  idx === session.turns.length - 1 &&
                  session.status !== "completed" && (
                    <form onSubmit={handleSubmitAnswer} style={{ marginTop: 12 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>
                        Your Spoken / Typed Answer
                      </label>
                      <textarea
                        value={answerInput}
                        onChange={(e) => setAnswerInput(e.target.value)}
                        placeholder="Speak into microphone or type your response..."
                        rows={4}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          borderRadius: 8,
                          border: "1.5px solid var(--line)",
                          fontSize: 14,
                          lineHeight: 1.5,
                          resize: "vertical",
                        }}
                      />

                      {interimTranscript && (
                        <div style={{ fontSize: 12, color: "#059669", background: "#ECFDF5", padding: "4px 8px", borderRadius: 6, marginTop: 6 }}>
                          🎙️ Hearing speech: <i>{interimTranscript}</i>
                        </div>
                      )}

                      {err && <div className="err" style={{ marginTop: 6, fontSize: 13 }}>{err}</div>}

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => (isMicActive ? stopListeningMic() : startListeningMic())}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 16,
                            border: isMicActive ? "1.5px solid #059669" : "1px solid var(--line)",
                            background: isMicActive ? "#ECFDF5" : "var(--surface-2)",
                            fontSize: 13,
                            fontWeight: 600,
                            color: isMicActive ? "#059669" : "var(--ink-soft)",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>🎙️</span>
                          <span>{isMicActive ? "Listening (Click to pause)" : "Start Mic"}</span>
                        </button>

                        <button
                          type="submit"
                          disabled={busy || !answerInput.trim()}
                          style={{
                            padding: "8px 20px",
                            borderRadius: 8,
                            border: "none",
                            background: busy || !answerInput.trim() ? "var(--line)" : "var(--p-gradient)",
                            color: "#fff",
                            fontSize: 14,
                            fontWeight: 700,
                            cursor: busy || !answerInput.trim() ? "not-allowed" : "pointer",
                          }}
                        >
                          {busy ? "Evaluating Answer…" : "Submit Answer →"}
                        </button>
                      </div>
                    </form>
                  )
                )}

                {/* Recruiter Turn Feedback */}
                {turn.feedback && (
                  <div style={{ fontSize: 12.5, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "8px 12px", borderRadius: 8, marginTop: 8 }}>
                    💡 <b>Recruiter Insight:</b> {turn.feedback}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── STEP 3: HIRING COMMITTEE EVALUATION SCORECARD ─────────────────── */}
          {session.status === "completed" && session.scorecard && (
            <div
              style={{
                background: "var(--surface)",
                border: "2px solid var(--line)",
                borderRadius: "var(--r)",
                padding: 24,
                boxShadow: "var(--sh)",
                marginTop: 24,
              }}
            >
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div className="eyebrow" style={{ color: "var(--marigold-dark)" }}>Hiring Committee Verdict</div>
                <h2 style={{ fontSize: 24, margin: "4px 0" }}>Candidate Evaluation Scorecard</h2>
                <div
                  style={{
                    display: "inline-block",
                    padding: "4px 14px",
                    borderRadius: 16,
                    fontSize: 13,
                    fontWeight: 700,
                    marginTop: 6,
                    background:
                      session.scorecard.verdict === "Strong Hire" || session.scorecard.verdict === "Hire"
                        ? "#ECFDF5"
                        : "#FEF2F2",
                    color:
                      session.scorecard.verdict === "Strong Hire" || session.scorecard.verdict === "Hire"
                        ? "#059669"
                        : "#DC2626",
                    border: "1px solid var(--line)",
                  }}
                >
                  Verdict: {session.scorecard.verdict}
                </div>
              </div>

              {/* Overall score ring & breakdown grid */}
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 20, alignItems: "center", marginBottom: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <Ring score={session.scorecard.overall_score || 75} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", marginTop: 4 }}>
                    Overall Score
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Technical Depth", val: session.scorecard.technical_depth },
                    { label: "Communication", val: session.scorecard.communication },
                    { label: "Problem Solving", val: session.scorecard.problem_solving },
                    { label: "Role Relevance", val: session.scorecard.role_relevance },
                    { label: "Evidence & Specificity", val: session.scorecard.specificity_evidence },
                  ].map((m) => (
                    <div key={m.label} style={{ background: "var(--surface-2)", padding: "8px 12px", borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>{m.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor(m.val || 70) }}>
                        {m.val || 70} / 100
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Executive Summary */}
              {session.scorecard.summary && (
                <div style={{ background: "var(--surface-2)", padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 13.5, lineHeight: 1.5 }}>
                  <b>Executive Summary:</b> {session.scorecard.summary}
                </div>
              )}

              {/* Strengths & Weaknesses */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", padding: 14, borderRadius: 10 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#059669" }}>Key Strengths</h4>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "var(--ink)" }}>
                    {(session.scorecard.strengths || []).map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ul>
                </div>
                <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", padding: 14, borderRadius: 10 }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#DC2626" }}>Weaknesses & Misses</h4>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "var(--ink)" }}>
                    {(session.scorecard.weaknesses || []).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Actionable Practice Recommendations */}
              {session.scorecard.practice_areas && (
                <div style={{ background: "var(--marigold-light)", padding: 14, borderRadius: 10 }}>
                  <h4 style={{ margin: "0 0 6px", fontSize: 13, color: "var(--marigold-dark)" }}>
                    🎯 Actionable Practice Recommendations
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: "var(--marigold-dark)" }}>
                    {session.scorecard.practice_areas.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
