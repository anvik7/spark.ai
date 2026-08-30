import React, { useState, useRef, useEffect, useCallback } from "react";
import { api } from "./api.js";

// ── Voice: Web Speech API ──────────
const SPEECH_OK =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

function useVoiceInput({ onTranscript, onError }) {
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
      onError?.("Voice error — check microphone permissions.");
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

const SUBJECT_PILLS = [
  { label: "Math", icon: "🧮", hint: "Mathematics" },
  { label: "Physics", icon: "🔬", hint: "Physics" },
  { label: "Chemistry", icon: "🧪", hint: "Chemistry" },
  { label: "Coding", icon: "💻", hint: "Computer Science" },
  { label: "Writing", icon: "✍️", hint: "Writing & Literature" },
  { label: "Economics", icon: "📊", hint: "Economics" },
  { label: "Research", icon: "📚", hint: "Research" },
  { label: "General", icon: "❓", hint: "General Academic" },
];

export default function Tasks() {
  const [promptText, setPromptText] = useState("");
  const [activeSubject, setActiveSubject] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [err, setErr] = useState("");

  // Solved Student Tasks from database
  const [tasks, setTasks] = useState([]);
  const [expandedTask, setExpandedTask] = useState(null);

  // Action states per task
  const [copiedTask, setCopiedTask] = useState(null);
  const [regeneratingTask, setRegeneratingTask] = useState(null);
  const [followupInputs, setFollowupInputs] = useState({});
  const [followupBusy, setFollowupBusy] = useState({});

  // Fetch real user tasks from database on mount
  const loadTasks = useCallback(() => {
    setLoadingTasks(true);
    api.getTasks()
      .then((data) => {
        setTasks(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        console.error("Failed to load student tasks from DB:", e);
        setErr("Could not connect to database to load tasks.");
      })
      .finally(() => setLoadingTasks(false));
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const fileInputRef = useRef();
  const textareaRef = useRef();

  const onTranscript = useCallback((t) => {
    setPromptText((prev) => (prev ? prev.trim() + " " + t.trim() : t.trim()));
  }, []);

  const { listening, interim, start, stop } = useVoiceInput({ onTranscript, onError: setErr });

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

  const handleSelectFile = (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setErr("File size must be under 25MB.");
      return;
    }
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      setFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setFilePreviewUrl(null);
    }
    setErr("");
  };

  const clearFile = () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(null);
    setFilePreviewUrl(null);
  };

  const handleSolveTask = async (e) => {
    e?.preventDefault();
    const input = promptText.trim();
    if (!input && !selectedFile) {
      setErr("Please type a question or select a file to solve.");
      return;
    }

    setBusy(true);
    setErr("");

    try {
      let createdTask;
      if (selectedFile) {
        createdTask = await api.uploadTaskFile(selectedFile, input, activeSubject || "");
      } else {
        createdTask = await api.solveTask(input, activeSubject || "");
      }

      if (createdTask) {
        setTasks((prev) => [createdTask, ...prev.filter((t) => t.id !== createdTask.id)]);
        setExpandedTask(createdTask.id);
        setPromptText("");
        clearFile();
        setActiveSubject(null);
      }
    } catch (error) {
      console.error("Solve task error:", error);
      setErr(error.message || "Failed to solve question. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyTask = (task) => {
    const textToCopy = `Question: ${task.prompt}\n\nSolution: ${task.solution}\n\nSteps:\n${(task.steps || []).map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedTask(task.id);
      setTimeout(() => setCopiedTask(null), 2000);
    });
  };

  const handleRegenerateTask = async (taskId) => {
    setRegeneratingTask(taskId);
    try {
      const updated = await api.regenerateTask(taskId);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (error) {
      console.error("Regenerate error:", error);
      setErr(error.message || "Failed to regenerate AI solution.");
    } finally {
      setRegeneratingTask(null);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await api.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (expandedTask === taskId) setExpandedTask(null);
    } catch (error) {
      console.error("Delete task error:", error);
      setErr(error.message || "Failed to delete task.");
    }
  };

  const handlePostFollowup = async (taskId, e) => {
    e?.preventDefault();
    const followupText = (followupInputs[taskId] || "").trim();
    if (!followupText) return;

    setFollowupBusy((prev) => ({ ...prev, [taskId]: true }));
    try {
      const updated = await api.postTaskFollowup(taskId, followupText);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      setFollowupInputs((prev) => ({ ...prev, [taskId]: "" }));
    } catch (error) {
      console.error("Follow-up error:", error);
      setErr(error.message || "Failed to post follow-up question.");
    } finally {
      setFollowupBusy((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  return (
    <div className="screen">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ color: "var(--marigold-dark)" }}>AI Student Workspace</div>
        <h1 className="title" style={{ fontSize: 26, margin: 0 }}>What do you need help solving?</h1>
        <p className="sub" style={{ margin: "4px 0 0", fontSize: 14 }}>
          Ask any calculus problem, physics question, code error, research paper, writing assignment, or general academic task. Spark AI provides direct answers, step-by-step reasoning, and contextual follow-ups.
        </p>
      </div>

      {/* Subject Filter Chips (Optional) */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 8 }}>
          Select Subject (Optional — AI Auto-detects if unselected)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SUBJECT_PILLS.map((sp) => {
            const isSelected = activeSubject === sp.label;
            return (
              <button
                key={sp.label}
                onClick={() => setActiveSubject(isSelected ? null : sp.label)}
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
                <span>{sp.icon}</span>
                <span>{sp.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Universal Task Input Form */}
      <form
        onSubmit={handleSolveTask}
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: 16,
          boxShadow: "var(--sh)",
          marginBottom: 24,
        }}
      >
        <textarea
          ref={textareaRef}
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="Ask anything: e.g. 'Solve this integral ∫ x sin(x) dx', 'Explain quantum entanglement', 'Debug this Python script', or paste a research text..."
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

        {listening && (
          <div style={{ padding: "6px 10px", background: "var(--marigold-light)", borderRadius: 8, fontSize: 13, color: "var(--marigold-dark)", marginBottom: 10 }}>
            🎙️ Listening to voice: <i>{interim || "speak your question…"}</i>
          </div>
        )}

        {selectedFile && (
          <div style={{ position: "relative", marginBottom: 12, display: "inline-block" }}>
            {filePreviewUrl ? (
              <img
                src={filePreviewUrl}
                alt="File preview"
                style={{ maxHeight: 130, borderRadius: 8, border: "1px solid var(--line)", display: "block" }}
              />
            ) : (
              <div style={{ padding: "10px 14px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, color: "var(--ink)" }}>
                📄 {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
              </div>
            )}
            <button
              type="button"
              onClick={clearFile}
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach photo or PDF document"
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
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,text/plain"
              style={{ display: "none" }}
              onChange={(e) => handleSelectFile(e.target.files?.[0])}
            />

            <button
              type="button"
              onClick={toggleVoice}
              title={listening ? "Stop recording" : "Speak question"}
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
            disabled={busy || (!promptText.trim() && !selectedFile)}
            style={{
              padding: "9px 20px",
              borderRadius: "var(--r-s)",
              border: "none",
              background: busy || (!promptText.trim() && !selectedFile) ? "var(--line)" : "var(--p-gradient)",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 700,
              cursor: busy || (!promptText.trim() && !selectedFile) ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              transition: "all .15s ease",
            }}
          >
            {busy ? "Solving with AI…" : "Solve Problem →"}
          </button>
        </div>
      </form>

      {/* Solved Tasks Stream */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Recent Tasks</h2>
            <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Your authenticated user solved questions and step-by-step AI reasoning</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "3px 10px", borderRadius: 12 }}>
            {tasks.length} saved
          </span>
        </div>

        {loadingTasks && (
          <div style={{ textAlign: "center", padding: 30, color: "var(--ink-soft)", fontSize: 14 }}>
            <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading your solved tasks from database…
          </div>
        )}

        {!loadingTasks && tasks.length === 0 && (
          <div className="empty" style={{ padding: 40, textAlign: "center", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px dashed var(--line)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🧮</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>No tasks yet</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
              Enter any math problem, physics question, code error, or essay prompt above to generate your first AI solution.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tasks.map((task) => {
            const isExpanded = expandedTask === task.id;
            const isCopied = copiedTask === task.id;
            const isRegenerating = regeneratingTask === task.id;

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
                      <span style={{ fontSize: 14 }}>{task.icon || "📚"}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--marigold-dark)" }}>
                        {task.subject || "General Academic"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                        · {new Date(task.created_at || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--ink)", lineHeight: 1.4 }}>
                      {task.title || task.prompt}
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
                      {task.status || "Solved by AI"}
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
                      {isExpanded ? "Hide Solution" : "View Solution →"}
                    </button>

                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      title="Delete task from database"
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

                {/* Step-by-Step AI Solution Drawer */}
                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                    {/* Action Bar: Copy & Regenerate */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
                      <button
                        onClick={() => handleCopyTask(task)}
                        style={{
                          fontSize: 12,
                          padding: "3px 10px",
                          borderRadius: 8,
                          border: `1px solid ${isCopied ? "#059669" : "var(--line)"}`,
                          background: isCopied ? "#ECFDF5" : "var(--surface-2)",
                          color: isCopied ? "#059669" : "var(--ink-soft)",
                          cursor: "pointer",
                        }}
                      >
                        {isCopied ? "✓ Copied Solution" : "📋 Copy Solution"}
                      </button>

                      <button
                        onClick={() => handleRegenerateTask(task.id)}
                        disabled={isRegenerating}
                        style={{
                          fontSize: 12,
                          padding: "3px 10px",
                          borderRadius: 8,
                          border: "1px solid var(--line)",
                          background: "var(--surface-2)",
                          color: "var(--ink-soft)",
                          cursor: isRegenerating ? "not-allowed" : "pointer",
                        }}
                      >
                        {isRegenerating ? "Regenerating…" : "🔄 Regenerate Answer"}
                      </button>
                    </div>

                    {/* Image / Attachment display */}
                    {task.imageUrl && (
                      <div style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                        <img src={task.imageUrl} alt="Attached problem" style={{ maxHeight: 220, width: "100%", objectFit: "cover" }} />
                      </div>
                    )}

                    {/* Direct AI Answer */}
                    <div style={{ background: "var(--surface-2)", padding: 12, borderRadius: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", display: "block", marginBottom: 2 }}>
                        AI Direct Answer
                      </span>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--marigold-dark)", lineHeight: 1.5 }}>
                        {task.solution}
                      </div>
                    </div>

                    {/* Step by step explanation */}
                    {task.steps && task.steps.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>
                          Step-by-Step Reasoning
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {task.steps.map((step, idx) => (
                            <div key={idx} style={{ display: "flex", gap: 8, fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>
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
                          Formulas & Key Principles
                        </span>
                        {task.formulas.map((f, idx) => (
                          <div key={idx} style={{ fontSize: 12.5, fontFamily: "monospace", background: "var(--surface-3)", padding: "4px 8px", borderRadius: 6, display: "inline-block", marginRight: 6, marginTop: 4 }}>
                            {f}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Intuition */}
                    {task.intuition && (
                      <div style={{ fontSize: 12.5, color: "var(--ink-soft)", fontStyle: "italic", background: "var(--marigold-light)", padding: 10, borderRadius: 8, marginBottom: 12 }}>
                        💡 <b>Intuition:</b> {task.intuition}
                      </div>
                    )}

                    {/* Practice Exercises */}
                    {task.practice && task.practice.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>
                          Follow-up Practice Questions
                        </span>
                        {task.practice.map((pq, idx) => (
                          <div key={idx} style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "3px 0" }}>
                            • {pq}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Follow-up Contextual Conversation Thread */}
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--marigold-dark)", display: "block", marginBottom: 8 }}>
                        💬 Follow-up Conversation
                      </span>

                      {task.thread && task.thread.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                          {task.thread.map((msg, idx) => {
                            const isUser = msg.role === "user";
                            return (
                              <div
                                key={idx}
                                style={{
                                  alignSelf: isUser ? "flex-end" : "flex-start",
                                  maxWidth: "90%",
                                  padding: "8px 12px",
                                  borderRadius: 10,
                                  fontSize: 13,
                                  lineHeight: 1.5,
                                  background: isUser ? "var(--marigold-light)" : "var(--surface-2)",
                                  color: isUser ? "var(--marigold-dark)" : "var(--ink)",
                                  border: isUser ? "1px solid var(--line)" : "1px solid var(--line)",
                                }}
                              >
                                <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 2, textTransform: "uppercase", color: "var(--ink-faint)" }}>
                                  {isUser ? "You" : "Spark AI"}
                                </div>
                                {msg.content}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <form onSubmit={(e) => handlePostFollowup(task.id, e)} style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text"
                          value={followupInputs[task.id] || ""}
                          onChange={(e) => setFollowupInputs((prev) => ({ ...prev, [task.id]: e.target.value }))}
                          placeholder="Ask a follow-up question about this problem..."
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid var(--line)",
                            background: "var(--surface)",
                            fontSize: 13,
                          }}
                        />
                        <button
                          type="submit"
                          disabled={followupBusy[task.id] || !(followupInputs[task.id] || "").trim()}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 8,
                            border: "none",
                            background: followupBusy[task.id] || !(followupInputs[task.id] || "").trim() ? "var(--line)" : "var(--p-gradient)",
                            color: "#fff",
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: followupBusy[task.id] || !(followupInputs[task.id] || "").trim() ? "not-allowed" : "pointer",
                          }}
                        >
                          {followupBusy[task.id] ? "Replying…" : "Send →"}
                        </button>
                      </form>
                    </div>
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
