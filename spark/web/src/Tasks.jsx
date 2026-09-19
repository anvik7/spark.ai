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

function renderStepWithCode(text) {
  if (!text) return null;
  if (!text.includes("```")) {
    return <span>{text}</span>;
  }
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div style={{ width: "100%" }}>
      {parts.map((part, idx) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const firstLineEnd = part.indexOf("\n");
          const lang = firstLineEnd !== -1 ? part.slice(3, firstLineEnd).trim() : "code";
          const codeContent = firstLineEnd !== -1 ? part.slice(firstLineEnd + 1, -3).trim() : part.slice(3, -3).trim();
          return (
            <div key={idx} style={{ margin: "8px 0", borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)", background: "#0F172A" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 12px", background: "#1E293B", color: "#94A3B8", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>
                <span>{lang || "code"}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(codeContent)}
                  style={{ background: "none", border: "none", color: "#94A3B8", fontSize: 11, cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <span>📋</span>
                  <span>Copy</span>
                </button>
              </div>
              <pre style={{ margin: 0, padding: 12, overflowX: "auto", fontSize: 13, color: "#F8FAFC", fontFamily: "monospace", lineHeight: 1.55 }}>
                <code>{codeContent}</code>
              </pre>
            </div>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </div>
  );
}

export default function Tasks() {
  const [promptText, setPromptText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [err, setErr] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Solved Student Tasks from database
  const [tasks, setTasks] = useState([]);
  const [expandedTask, setExpandedTask] = useState(null);

  // Action states per task
  const [copiedTask, setCopiedTask] = useState(null);
  const [regeneratingTask, setRegeneratingTask] = useState(null);
  const [followupInputs, setFollowupInputs] = useState({});
  const [followupBusy, setFollowupBusy] = useState({});

  const loadTasks = useCallback(() => {
    setLoadingTasks(true);
    api.getTasks()
      .then((data) => {
        setTasks(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        console.error("Failed to load tasks from DB:", e);
        setErr("Could not connect to database to load tasks.");
      })
      .finally(() => setLoadingTasks(false));
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const fileInputRef = useRef();
  const textareaRef = useRef();
  const isSubmittingRef = useRef(false);
  const abortControllerRef = useRef(null);

  const isMac = typeof navigator !== "undefined" && (
    (navigator.platform && navigator.platform.toUpperCase().indexOf("MAC") >= 0) ||
    (navigator.userAgentData?.platform === "macOS")
  );

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

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleSelectFile(file);
  };

  const handleSolveTask = async (e) => {
    e?.preventDefault();
    if (isSubmittingRef.current || busy) return;

    const voiceAddition = (interim || "").trim();
    const input = (promptText + (voiceAddition ? " " + voiceAddition : "")).trim();
    if (!input && !selectedFile) {
      setErr("Please type a question or attach a file.");
      return;
    }

    if (listening) {
      stop();
    }

    isSubmittingRef.current = true;
    setBusy(true);
    setErr("");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let createdTask;
      if (selectedFile) {
        createdTask = await api.uploadTaskFile(selectedFile, input, "", { signal: controller.signal });
      } else {
        createdTask = await api.solveTask(input, "", { signal: controller.signal });
      }

      if (createdTask) {
        setTasks((prev) => [createdTask, ...prev.filter((t) => t.id !== createdTask.id)]);
        setExpandedTask(createdTask.id);
        setPromptText("");
        clearFile();
      }
    } catch (error) {
      console.error("Solve task error:", error);
      if (error.code === "ABORTED" || error.name === "AbortError") {
        setErr("Request cancelled.");
      } else {
        setErr(error.message || "Failed to solve question. Please try again.");
      }
    } finally {
      isSubmittingRef.current = false;
      setBusy(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
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
      setErr(error.message || "Failed to regenerate solution.");
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

  const handleFollowupSubmit = async (e, taskId, explicitText = null) => {
    e?.preventDefault();
    const followupText = (explicitText !== null ? explicitText : (followupInputs[taskId] || "")).trim();
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
        <h1 className="title" style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--ink)" }}>Tasks</h1>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Ask anything and receive clear solutions with step-by-step reasoning.
        </p>
      </div>

      {/* Universal Minimal Composer */}
      <form
        onSubmit={handleSolveTask}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          background: "var(--surface)",
          border: isDragging ? "2px dashed var(--marigold)" : "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: "14px 16px",
          boxShadow: isDragging ? "0 0 12px rgba(245, 158, 11, 0.25)" : "var(--sh-sm)",
          marginBottom: 24,
          transition: "all .15s ease",
        }}
      >
        <textarea
          ref={textareaRef}
          value={promptText}
          onChange={(e) => {
            setPromptText(e.target.value);
            if (err) setErr("");
          }}
          onKeyDown={(e) => {
            // Respect IME composition (East Asian transliteration, etc.)
            if (e.nativeEvent?.isComposing || e.isComposing || e.keyCode === 229) {
              return;
            }

            if (e.key === "Enter") {
              const isCtrlOrCmd = e.ctrlKey || e.metaKey;
              // Shift+Enter without Ctrl/Cmd: insert newline, do NOT submit
              if (e.shiftKey && !isCtrlOrCmd) {
                return;
              }
              // Enter, Ctrl+Enter, or Cmd+Enter: submit
              e.preventDefault();
              handleSolveTask(e);
            }
          }}
          placeholder="Ask anything or attach/drop problem image, PDF, DOCX"
          rows={3}
          style={{
            width: "100%",
            minHeight: 76,
            border: "none",
            outline: "none",
            fontSize: 15,
            lineHeight: 1.55,
            fontFamily: "var(--sans)",
            background: "transparent",
            resize: "vertical",
            color: "var(--ink)",
            boxSizing: "border-box",
            padding: "2px 0",
          }}
        />

        {listening && (
          <div style={{ padding: "6px 10px", background: "var(--marigold-light)", borderRadius: 8, fontSize: 12.5, color: "var(--marigold-dark)", marginBottom: 10 }}>
            🎙️ <i>{interim || "Listening…"}</i>
          </div>
        )}

        {selectedFile && (
          <div style={{ position: "relative", marginBottom: 12, display: "inline-block" }}>
            {filePreviewUrl ? (
              <img
                src={filePreviewUrl}
                alt="Attachment preview"
                style={{ maxHeight: 120, borderRadius: 8, border: "1px solid var(--line)", display: "block" }}
              />
            ) : (
              <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--line)", fontSize: 12.5, color: "var(--ink)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>{selectedFile.name.endsWith(".docx") ? "📝" : selectedFile.name.endsWith(".pdf") ? "📄" : "📑"}</span>
                <span style={{ fontWeight: 600 }}>{selectedFile.name}</span>
                <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>({Math.round(selectedFile.size / 1024)} KB)</span>
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
                width: 20,
                height: 20,
                fontSize: 11,
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

        {busy && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, marginBottom: 10, fontSize: 13, color: "var(--marigold-dark)", fontWeight: 600 }}>
            <span className="spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid var(--marigold)", borderTopColor: "transparent", borderRadius: "50%" }} />
            <span>Thinking and deriving solution…</span>
          </div>
        )}

        {err && (
          <div className="err" style={{ marginBottom: 10, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span>{err}</span>
            {err !== "Request cancelled." && (promptText.trim() || selectedFile) && (
              <button
                type="button"
                onClick={handleSolveTask}
                style={{
                  background: "transparent",
                  border: "1px solid currentColor",
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  color: "inherit",
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Minimal Icon-First Composer Controls */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* "+" Icon Attachment Control */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach photo or document (Image, PDF, DOCX, TXT)"
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                fontSize: 18,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--ink)",
              }}
            >
              +
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,text/plain,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: "none" }}
              onChange={(e) => handleSelectFile(e.target.files?.[0])}
            />

            {/* Microphone Icon Control */}
            <button
              type="button"
              onClick={toggleVoice}
              title={listening ? "Stop voice" : "Voice input"}
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                border: listening ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                background: listening ? "var(--marigold-light)" : "var(--surface-2)",
                fontSize: 16,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: listening ? "var(--marigold-dark)" : "var(--ink)",
              }}
            >
              🎙️
            </button>

            {/* Keyboard Shortcut Hint */}
            <span style={{ fontSize: 11.5, color: "var(--ink-faint)", userSelect: "none" }}>
              {isMac ? "⌘ Enter to send" : "Ctrl Enter to send"} · Shift Enter for newline
            </span>
          </div>

          {/* Send / Stop Button */}
          {busy ? (
            <button
              type="button"
              onClick={handleStop}
              title="Stop generating"
              style={{
                height: 38,
                padding: "0 14px",
                borderRadius: 19,
                border: "1.5px solid #EF4444",
                background: "#FEF2F2",
                color: "#DC2626",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "all .15s ease",
              }}
            >
              <span style={{ display: "inline-block", width: 8, height: 8, background: "#DC2626", borderRadius: 2 }} />
              <span>Stop</span>
            </button>
          ) : (() => {
            const hasContent = !!promptText.trim() || !!(interim || "").trim() || !!selectedFile;
            const canSubmit = !busy && hasContent;
            return (
              <button
                type="submit"
                onClick={handleSolveTask}
                disabled={!canSubmit}
                title="Send"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  border: "none",
                  background: canSubmit ? "var(--p-gradient)" : "var(--line)",
                  color: canSubmit ? "#FFFFFF" : "var(--ink-faint)",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  boxShadow: canSubmit ? "0 2px 6px rgba(0,0,0,0.12)" : "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all .15s ease",
                }}
              >
                ↑
              </button>
            );
          })()}
        </div>
      </form>

      {/* Solved Tasks Stream */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Recent Tasks</h2>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "2px 8px", borderRadius: 10 }}>
            {tasks.length} items
          </span>
        </div>

        {loadingTasks && (
          <div style={{ textAlign: "center", padding: 30, color: "var(--ink-soft)", fontSize: 13.5 }}>
            <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading tasks…
          </div>
        )}

        {!loadingTasks && tasks.length === 0 && (
          <div className="empty" style={{ padding: 36, textAlign: "center", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px dashed var(--line)" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>No tasks yet</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>
              Type a question or attach a file above to get started.
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
                      <span style={{ fontSize: 14 }}>{task.icon || "💬"}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--marigold-dark)" }}>
                        {task.subject || "General"}
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
                    <button
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 10,
                        border: "1px solid var(--line)",
                        background: "var(--surface-2)",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--ink-soft)",
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded ? "Hide" : "View Solution →"}
                    </button>

                    <button
                      onClick={() => handleDeleteTask(task.id)}
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

                {/* Step-by-Step Solution Drawer */}
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
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span>{isCopied ? "✓" : "📋"}</span>
                        <span>{isCopied ? "Copied" : "Copy"}</span>
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
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span>🔄</span>
                        <span>{isRegenerating ? "Regenerating…" : "Regenerate"}</span>
                      </button>
                    </div>

                    {/* Attachment display */}
                    {task.imageUrl && (
                      <div style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                        <img src={task.imageUrl} alt="Attached problem" style={{ maxHeight: 220, width: "100%", objectFit: "cover" }} />
                      </div>
                    )}

                    {/* Direct Solution / Code Output */}
                    <div style={{ background: "var(--surface-2)", padding: 12, borderRadius: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", display: "block", marginBottom: 4 }}>
                        Solution
                      </span>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--marigold-dark)", lineHeight: 1.5 }}>
                        {renderStepWithCode(task.solution)}
                      </div>
                    </div>

                    {/* Step by step explanation */}
                    {task.steps && task.steps.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", display: "block", marginBottom: 6 }}>
                          Steps & Reasoning
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {task.steps.map((step, idx) => (
                            <div key={idx} style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5, background: "var(--surface)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)" }}>
                              {renderStepWithCode(step)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Formulas / Metrics */}
                    {task.formulas && task.formulas.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", display: "block", marginBottom: 4 }}>
                          Formulas & Metrics
                        </span>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {task.formulas.map((f, idx) => (
                            <span key={idx} style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "var(--marigold-light)", color: "var(--marigold-dark)", border: "1px solid var(--line)" }}>
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Intuition */}
                    {task.intuition && (
                      <div style={{ marginBottom: 12, fontSize: 13, color: "var(--ink)", background: "var(--surface-2)", padding: 10, borderRadius: 8, border: "1px solid var(--line)" }}>
                        💡 <b>Intuition:</b> {task.intuition}
                      </div>
                    )}

                    {/* Contextual Follow-up Thread */}
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--line)" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-faint)", display: "block", marginBottom: 8 }}>
                        Follow-up Discussion
                      </span>

                      {/* Quick Follow-up Action Pills */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                        {[
                          { label: "✨ Simplify", query: "Can you explain this in simpler terms with an intuitive example?" },
                          { label: "🔍 Explain More", query: "Can you explain the reasoning and derivation in more detail?" },
                          { label: "💻 Code version", query: "Can you provide a runnable code implementation with comments for this?" },
                          { label: "📝 Key Points", query: "What are the key takeaways, edge cases, and pitfalls to watch out for?" },
                        ].map((action, aIdx) => (
                          <button
                            key={aIdx}
                            type="button"
                            disabled={followupBusy[task.id]}
                            onClick={() => handleFollowupSubmit(null, task.id, action.query)}
                            style={{
                              fontSize: 12,
                              padding: "4px 10px",
                              borderRadius: 14,
                              border: "1px solid var(--line)",
                              background: "var(--surface-2)",
                              color: "var(--ink-soft)",
                              cursor: followupBusy[task.id] ? "not-allowed" : "pointer",
                              fontWeight: 600,
                              transition: "all .15s ease",
                            }}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>

                      {task.thread && task.thread.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                          {task.thread.map((msg, mIdx) => (
                            <div
                              key={mIdx}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                fontSize: 13,
                                background: msg.role === "user" ? "var(--marigold-light)" : "var(--surface-2)",
                                color: msg.role === "user" ? "var(--marigold-dark)" : "var(--ink)",
                                border: "1px solid var(--line)",
                                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                                maxWidth: "90%",
                              }}
                            >
                              <div style={{ fontSize: 10.5, fontWeight: 700, marginBottom: 2, opacity: 0.8 }}>
                                {msg.role === "user" ? "You" : "SparkDhi"}
                              </div>
                              <div style={{ whiteSpace: "pre-wrap" }}>{renderStepWithCode(msg.content)}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      <form onSubmit={(e) => handleFollowupSubmit(e, task.id)} style={{ display: "flex", gap: 8 }}>
                        <input
                          value={followupInputs[task.id] || ""}
                          onChange={(e) => setFollowupInputs((prev) => ({ ...prev, [task.id]: e.target.value }))}
                          placeholder="Ask a follow-up question..."
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid var(--line)",
                            fontSize: 13,
                            background: "var(--surface-2)",
                            color: "var(--ink)",
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
                            color: "#ffffff",
                            fontSize: 12.5,
                            fontWeight: 700,
                            cursor: followupBusy[task.id] || !(followupInputs[task.id] || "").trim() ? "not-allowed" : "pointer",
                          }}
                        >
                          {followupBusy[task.id] ? "…" : "Reply"}
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
