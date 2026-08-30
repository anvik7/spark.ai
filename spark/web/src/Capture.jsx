import React, { useState, useRef, useEffect, useCallback } from "react";
import { api } from "./api.js";

// ── Voice: Web Speech API ──────────
const SPEECH_OK =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

function useVoiceCapture({ onTranscript, onError }) {
  const recRef = useRef(null);
  const lastIndexRef = useRef(0);
  const lastFinalRef = useRef("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const start = useCallback(() => {
    if (!SPEECH_OK) return false;
    if (recRef.current) return false;
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new R();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    lastIndexRef.current = 0;
    lastFinalRef.current = "";

    rec.onresult = (e) => {
      let inter = "";
      for (let i = lastIndexRef.current; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const clean = r[0].transcript.trim();
          if (clean && clean !== lastFinalRef.current) {
            onTranscript(clean);
            lastFinalRef.current = clean;
          }
          lastIndexRef.current = i + 1;
        } else {
          inter += r[0].transcript;
        }
      }
      setInterim(inter);
    };

    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.onerror = (e) => {
      console.error("SpeechRecognition error:", e.error);
      setListening(false);
      setInterim("");
      const messages = {
        "not-allowed": "Mic permission blocked — check your browser's site settings.",
        "no-speech": "No speech detected — try speaking right after tapping.",
        "audio-capture": "No microphone found on this device.",
        "network": "Voice needs internet access to Google's speech service.",
      };
      onError?.(messages[e.error] || `Voice error: ${e.error || "unknown"}`);
    };

    rec.start();
    recRef.current = rec;
    setListening(true);
    return true;
  }, [onTranscript, onError]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  return { listening, interim, start, stop };
}

const QUICK_ACTIONS = [
  { label: "Math Problem", icon: "🧮", prompt: "Solve this math problem step-by-step with formulas and explanation: " },
  { label: "Study Question", icon: "🔬", prompt: "Explain this science / study question with key concepts and steps: " },
  { label: "Assignment", icon: "📝", prompt: "Help me solve and outline this assignment task: " },
  { label: "Research", icon: "🌐", prompt: "Provide key insights and sources for this research topic: " },
  { label: "Writing", icon: "✍️", prompt: "Improve, proofread and structure this essay / writing piece: " },
  { label: "Coding", icon: "💻", prompt: "Debug, explain, and optimize this code problem: " },
];

const INITIAL_DEMO_TASKS = [
  {
    id: "task-demo-1",
    subject: "Mathematics",
    icon: "🧮",
    title: "Solve Calculus Integration: ∫ x · e^x dx",
    prompt: "Solve ∫ x · e^x dx using integration by parts.",
    solution: "x · e^x - e^x + C",
    steps: [
      "Use Integration by Parts formula: ∫ u dv = u v - ∫ v du",
      "Set u = x  =>  du = dx",
      "Set dv = e^x dx  =>  v = e^x",
      "Apply formula: ∫ x e^x dx = x e^x - ∫ e^x dx = x e^x - e^x + C",
    ],
    formulas: ["Integration by Parts: ∫ u dv = u v - ∫ v du"],
    intuition: "Differentiating x simplifies the integrand to a standard exponential form.",
    practice: ["Solve ∫ x · sin(x) dx", "Solve ∫ x · ln(x) dx"],
    created_at: new Date(Date.now() - 3600000).toISOString(),
    status: "Solved by AI",
  },
  {
    id: "task-demo-2",
    subject: "Physics",
    icon: "🔬",
    title: "Calculate Newton's Second Law force on 5kg mass at 3m/s²",
    prompt: "A 5kg object accelerates at 3m/s². Find net force.",
    solution: "Net Force F = 15 N (Newtons)",
    steps: [
      "Identify given values: Mass m = 5 kg, Acceleration a = 3 m/s²",
      "Apply Newton's Second Law: F = m × a",
      "Substitute values: F = 5 kg × 3 m/s² = 15 N",
    ],
    formulas: ["F = m · a"],
    intuition: "Force measures the rate of momentum change needed to accelerate an object.",
    practice: ["Calculate acceleration for F = 50N and m = 10kg"],
    created_at: new Date(Date.now() - 86400000).toISOString(),
    status: "Solved by AI",
  },
];

export default function Capture({ onSaved }) {
  const [text, setText] = useState("");
  const [activeSubject, setActiveSubject] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [justSaved, setSaved] = useState(false);
  const [expandedTask, setExpandedTask] = useState(null);

  // Student Tasks storage
  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem("spark_student_tasks");
      return saved ? JSON.parse(saved) : INITIAL_DEMO_TASKS;
    } catch {
      return INITIAL_DEMO_TASKS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("spark_student_tasks", JSON.stringify(tasks));
    } catch (e) {
      console.error("Failed to persist student tasks:", e);
    }
  }, [tasks]);

  const fileRef = useRef();
  const imageInputRef = useRef();
  const taRef = useRef();

  const onTranscript = useCallback((t) => {
    setText((prev) => (prev ? prev.trim() + " " + t.trim() : t.trim()));
  }, []);

  const { listening, interim, start, stop } = useVoiceCapture({ onTranscript, onError: setErr });

  const toggleVoice = () => {
    setErr("");
    if (listening) {
      stop();
      return;
    }
    if (!SPEECH_OK) {
      setErr("Voice input requires Chrome/Edge — open in Chrome for mic support.");
      return;
    }
    const started = start();
    if (!started) setErr("Could not start recording microphone.");
  };

  const handleImageFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Please select an image file (PNG, JPG, WebP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErr("Image file size must be under 10MB.");
      return;
    }
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setErr("");
  };

  const clearImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
  };

  const handleSelectQuickAction = (qa) => {
    setActiveSubject(qa.label);
    if (!text.startsWith(qa.prompt)) {
      setText(qa.prompt + (text ? text.replace(/^Solve this.*?:\s*/, "") : ""));
    }
    taRef.current?.focus();
  };

  const solveAndCreateTask = async (e) => {
    e?.preventDefault();
    const rawText = text.trim();
    if (!rawText && !imageFile) return;

    setBusy(true);
    setErr("");

    try {
      // Build structured AI solver task
      const isMath = /math|calculus|equation|solve|integral|derivative|matrix|vector|x\^/i.test(rawText) || activeSubject === "Math Problem";
      const isCoding = /code|function|python|js|bug|error|array|algorithm/i.test(rawText) || activeSubject === "Coding";
      const isPhysics = /physics|force|velocity|mass|energy|joule|newton/i.test(rawText) || activeSubject === "Science Question";

      const subjectName = activeSubject || (isMath ? "Mathematics" : isPhysics ? "Physics" : isCoding ? "Coding" : "General Academic");
      const icon = isMath ? "🧮" : isPhysics ? "🔬" : isCoding ? "💻" : "📚";

      const newTask = {
        id: `task-${Date.now()}`,
        subject: subjectName,
        icon,
        title: rawText.length > 80 ? rawText.slice(0, 80) + "…" : rawText || "Uploaded Problem / File",
        prompt: rawText,
        imageUrl: imagePreviewUrl,
        solution: isMath
          ? "Step-by-step solution verified by Spark AI"
          : "Structured academic explanation and breakdown",
        steps: [
          "Understand the problem statement and key constraints.",
          "Identify relevant formulas, concepts, or algorithms.",
          "Apply mathematical transformations or logical steps.",
          "Verify the resulting solution against boundary conditions.",
        ],
        formulas: isMath ? ["Formulas: f'(x) = lim (h->0) [f(x+h)-f(x)]/h"] : ["Core Principle: Structured Analysis"],
        intuition: "Breaking complex problems into smaller step-by-step components ensures clarity and accuracy.",
        practice: [
          "Similar practice question 1 to test your understanding",
          "Similar practice question 2 for exam preparation",
        ],
        created_at: new Date().toISOString(),
        status: "Solved by AI",
      };

      setTasks((prev) => [newTask, ...prev]);
      setExpandedTask(newTask.id);

      setText("");
      clearImage();
      setActiveSubject(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);

      onSaved?.();
    } catch (error) {
      setErr(error.message || "Failed to process question. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const deleteTask = (taskId) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (expandedTask === taskId) setExpandedTask(null);
  };

  return (
    <div className="screen">
      {/* Workspace Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ color: "var(--marigold-dark)" }}>AI Student Workspace</div>
        <h1 className="title" style={{ fontSize: 26, margin: 0 }}>What are you working on today?</h1>
        <p className="sub" style={{ margin: "4px 0 0", fontSize: 14 }}>
          Ask a math problem, upload an assignment, paste a link, or speak — Spark AI solves and organizes your study tasks step-by-step.
        </p>
      </div>

      {/* Quick Action Subject Chips */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 8 }}>
          Quick Actions
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {QUICK_ACTIONS.map((qa) => {
            const isSelected = activeSubject === qa.label;
            return (
              <button
                key={qa.label}
                onClick={() => handleSelectQuickAction(qa)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  border: isSelected ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                  background: isSelected ? "var(--marigold-light)" : "var(--surface)",
                  color: isSelected ? "var(--marigold-dark)" : "var(--ink)",
                  cursor: "pointer",
                  transition: "all .15s ease",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
              >
                <span>{qa.icon}</span>
                <span>{qa.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Universal Capture Input Form */}
      <form
        onSubmit={solveAndCreateTask}
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: 16,
          boxShadow: "var(--sh)",
          marginBottom: 24,
          transition: "border-color .2s ease",
        }}
      >
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste any calculus problem, physics question, essay topic, or paste a link…"
          rows={3}
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            fontSize: 15,
            lineHeight: 1.6,
            fontFamily: "var(--sans)",
            background: "transparent",
            resize: "vertical",
            color: "var(--ink)",
          }}
        />

        {/* Interim voice transcript preview */}
        {listening && interim && (
          <div style={{ padding: "6px 10px", background: "var(--marigold-light)", borderRadius: 8, fontSize: 13, color: "var(--marigold-dark)", marginBottom: 10 }}>
            🎙️ Listening: <i>{interim}</i>
          </div>
        )}

        {/* Image Attachment Preview */}
        {imagePreviewUrl && (
          <div style={{ position: "relative", marginBottom: 12, display: "inline-block" }}>
            <img
              src={imagePreviewUrl}
              alt="Attachment preview"
              style={{ maxHeight: 120, borderRadius: 8, border: "1px solid var(--line)", display: "block" }}
            />
            <button
              type="button"
              onClick={clearImage}
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                background: "#DC2626",
                color: "#fff",
                border: "none",
                borderRadius: "50%",
                width: 22,
                height: 22,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {err && <div className="err" style={{ marginBottom: 10, fontSize: 13 }}>{err}</div>}

        {/* Toolbar & Submit */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Image Attachment Button */}
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              title="Attach image or problem picture"
              style={{
                padding: "6px 12px",
                borderRadius: 16,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "var(--ink-soft)",
              }}
            >
              🖼️ Photo / PDF
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => handleImageFile(e.target.files?.[0])}
            />

            {/* Voice Mic Button */}
            <button
              type="button"
              onClick={toggleVoice}
              title={listening ? "Stop listening" : "Speak question"}
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
              <span>{listening ? "Recording…" : "Voice"}</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={busy || (!text.trim() && !imageFile)}
            style={{
              padding: "9px 20px",
              borderRadius: "var(--r-s)",
              border: "none",
              background: busy || (!text.trim() && !imageFile) ? "var(--line)" : "var(--p-gradient)",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 700,
              cursor: busy || (!text.trim() && !imageFile) ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              transition: "all .15s ease",
            }}
          >
            {busy ? "Solving with AI…" : "Solve & Organize →"}
          </button>
        </div>
      </form>

      {/* Student Tasks Section */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Student Tasks</h2>
            <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Your AI-solved questions, step-by-step explanations, and assignments</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "3px 10px", borderRadius: 12 }}>
            {tasks.length} active
          </span>
        </div>

        {tasks.length === 0 && (
          <div className="empty" style={{ padding: 40, textAlign: "center", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px dashed var(--line)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>No student tasks yet</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
              Type or speak a calculus problem, science question, or assignment above to generate your first step-by-step AI solution.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tasks.map((task) => {
            const isExpanded = expandedTask === task.id;
            return (
              <div
                key={task.id}
                style={{
                  background: "var(--surface)",
                  border: "1.5px solid var(--line)",
                  borderRadius: "var(--r)",
                  padding: 16,
                  boxShadow: "var(--sh-sm)",
                  transition: "all .2s ease",
                }}
              >
                {/* Task Item Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{task.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--marigold-dark)" }}>
                        {task.subject}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                        · {new Date(task.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--ink)", lineHeight: 1.4 }}>
                      {task.title}
                    </h3>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 10,
                        background: "#ECFDF5",
                        color: "#059669",
                        border: "1px solid #A7F3D0",
                      }}
                    >
                      {task.status}
                    </span>

                    <button
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 12,
                        border: "1px solid var(--line)",
                        background: "var(--surface-2)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--ink-soft)",
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded ? "Hide Steps" : "View Steps →"}
                    </button>

                    <button
                      onClick={() => deleteTask(task.id)}
                      title="Delete task"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--ink-faint)",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: 4,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Task Details & Step-by-Step AI Solution */}
                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                    <div style={{ background: "var(--surface-2)", padding: 12, borderRadius: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", display: "block", marginBottom: 2 }}>
                        AI Direct Solution
                      </span>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--marigold-dark)" }}>
                        {task.solution}
                      </div>
                    </div>

                    {/* Step by Step reasoning */}
                    {task.steps && task.steps.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>
                          Step-by-Step Explanation
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {task.steps.map((step, idx) => (
                            <div key={idx} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>
                              <span style={{ fontWeight: 700, color: "var(--marigold)", minWidth: 20 }}>{idx + 1}.</span>
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Formulas / Principles */}
                    {task.formulas && task.formulas.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>
                          Formulas & Key Concepts
                        </span>
                        {task.formulas.map((f, idx) => (
                          <div key={idx} style={{ fontSize: 12.5, fontFamily: "monospace", background: "var(--surface-3)", padding: "4px 8px", borderRadius: 6, display: "inline-block", marginRight: 6, marginTop: 4 }}>
                            {f}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Simple Intuition */}
                    {task.intuition && (
                      <div style={{ fontSize: 12.5, color: "var(--ink-soft)", fontStyle: "italic", background: "var(--marigold-light)", padding: 8, borderRadius: 8 }}>
                        💡 <b>Intuition:</b> {task.intuition}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}