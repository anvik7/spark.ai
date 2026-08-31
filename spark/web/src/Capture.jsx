import React, { useState, useRef, useEffect, useCallback } from "react";
import { api } from "./api.js";

// ── Voice: Web Speech API & MediaRecorder ──────────
const SPEECH_OK =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

function useVoiceCapture({ onTranscript, onError }) {
  const recRef = useRef(null);
  const mediaRecRef = useRef(null);
  const audioChunksRef = useRef([]);
  const lastIndexRef = useRef(0);
  const lastFinalRef = useRef("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [recordedAudioBlob, setRecordedAudioBlob] = useState(null);

  const start = useCallback(() => {
    if (!SPEECH_OK && !navigator.mediaDevices?.getUserMedia) return false;
    audioChunksRef.current = [];
    setRecordedAudioBlob(null);

    // 1. Web Speech transcript recognition
    if (SPEECH_OK) {
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

      rec.onend = () => setListening(false);
      rec.onerror = (e) => console.warn("Speech error:", e.error);
      try { rec.start(); recRef.current = rec; } catch {}
    }

    // 2. Audio MediaRecorder for file upload
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          const mr = new MediaRecorder(stream);
          mediaRecRef.current = mr;
          mr.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };
          mr.onstop = () => {
            const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            setRecordedAudioBlob(blob);
            stream.getTracks().forEach((track) => track.stop());
          };
          mr.start();
        })
        .catch((err) => console.warn("Mic MediaRecorder error:", err));
    }

    setListening(true);
    return true;
  }, [onTranscript]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;

    try {
      if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
        mediaRecRef.current.stop();
      }
    } catch {}
    mediaRecRef.current = null;

    setListening(false);
    setInterim("");
  }, []);

  return { listening, interim, recordedAudioBlob, setRecordedAudioBlob, start, stop };
}

const CAPTURE_MODES = [
  { label: "Short Note", icon: "📝", kind: "note" },
  { label: "Thought", icon: "💡", kind: "idea" },
  { label: "Web Link", icon: "🔗", kind: "link" },
  { label: "Photo / Diagram", icon: "🖼️", kind: "image" },
  { label: "PDF / Doc", icon: "📄", kind: "pdf" },
  { label: "Voice Note", icon: "🎙️", kind: "voice" },
];

export default function Capture({ onSaved }) {
  const [text, setText] = useState("");
  const [activeKind, setActiveKind] = useState("note");
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingCaptures, setLoadingCaptures] = useState(true);
  const [err, setErr] = useState("");
  const [justSaved, setSaved] = useState(false);

  // Real Database Captures for authenticated user
  const [captures, setCaptures] = useState([]);

  // Fetch real captures from backend DB on mount
  const loadCaptures = useCallback(() => {
    setLoadingCaptures(true);
    api.getCaptures()
      .then((data) => {
        setCaptures(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        console.error("Failed to load user captures from DB:", e);
        setErr("Could not connect to database to load saved captures.");
      })
      .finally(() => setLoadingCaptures(false));
  }, []);

  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  const fileInputRef = useRef();
  const textareaRef = useRef();

  const onTranscript = useCallback((t) => {
    setText((prev) => (prev ? prev.trim() + " " + t.trim() : t.trim()));
  }, []);

  const { listening, interim, recordedAudioBlob, setRecordedAudioBlob, start, stop } = useVoiceCapture({ onTranscript, onError: setErr });

  const toggleVoice = () => {
    setErr("");
    if (listening) {
      stop();
      return;
    }
    const started = start();
    if (!started) setErr("Microphone access is blocked or unavailable in this browser.");
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

  const clearVoiceBlob = () => {
    setRecordedAudioBlob(null);
  };

  const handleSaveCapture = async (e) => {
    e?.preventDefault();
    const rawText = text.trim();
    if (!rawText && !selectedFile && !recordedAudioBlob) {
      setErr("Please type a note, paste a link, or select a file to save.");
      return;
    }

    setBusy(true);
    setErr("");

    try {
      let savedItem;

      // 1. Voice audio recording blob save
      if (recordedAudioBlob) {
        savedItem = await api.uploadCaptureVoice(recordedAudioBlob);
      }
      // 2. File / Image / PDF save
      else if (selectedFile) {
        savedItem = await api.uploadCaptureFile(selectedFile);
      }
      // 3. Text / Link note save
      else {
        const isUrl = /^https?:\/\//i.test(rawText);
        const kind = isUrl ? "link" : activeKind;
        savedItem = await api.createCapture(kind, rawText, isUrl ? rawText : "");
      }

      if (savedItem) {
        setCaptures((prev) => [savedItem, ...prev.filter((c) => c.id !== savedItem.id)]);
        setText("");
        clearFile();
        clearVoiceBlob();
        setSaved(true);
        setTimeout(() => setSaved(false), 2400);
        onSaved?.();
      }
    } catch (error) {
      console.error("Save capture error:", error);
      setErr(error.message || "Failed to save capture to database.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCapture = async (id) => {
    try {
      await api.deleteCapture(id);
      setCaptures((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error("Failed to delete capture:", error);
      setErr(error.message || "Failed to delete capture.");
    }
  };

  return (
    <div className="screen">
      {/* Knowledge Saver Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Capture Workspace</h1>
        <p className="sub" style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Save notes, thoughts, web links, files, or voice ideas directly to your workspace.
        </p>
      </div>

      {/* Mode Chips */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CAPTURE_MODES.map((m) => {
            const isSelected = activeKind === m.kind;
            return (
              <button
                key={m.kind}
                onClick={() => setActiveKind(m.kind)}
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
                <span>{m.icon}</span>
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Composer Form */}
      <form
        onSubmit={handleSaveCapture}
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
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Capture anything you're learning, thinking about, or want to remember..."
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
            🎙️ Recording voice note… {interim ? <i>"{interim}"</i> : ""}
          </div>
        )}

        {recordedAudioBlob && !listening && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>🎙️ Voice Recording Ready</span>
            <audio controls src={URL.createObjectURL(recordedAudioBlob)} style={{ height: 32, flex: 1 }} />
            <button type="button" onClick={clearVoiceBlob} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14 }}>✕</button>
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
              accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: "none" }}
              onChange={(e) => handleSelectFile(e.target.files?.[0])}
            />

            <button
              type="button"
              onClick={toggleVoice}
              title={listening ? "Stop recording" : "Record voice note"}
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
              <span>{listening ? "Stop Recording" : "Voice"}</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={busy || (!text.trim() && !selectedFile && !recordedAudioBlob)}
            style={{
              padding: "9px 20px",
              borderRadius: "var(--r-s)",
              border: "none",
              background: busy || (!text.trim() && !selectedFile && !recordedAudioBlob) ? "var(--line)" : "var(--p-gradient)",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 700,
              cursor: busy || (!text.trim() && !selectedFile && !recordedAudioBlob) ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              transition: "all .15s ease",
            }}
          >
            {busy ? "Saving to DB…" : justSaved ? "Saved! ✓" : "Save Knowledge →"}
          </button>
        </div>
      </form>

      {/* Recent Captures / Saved Knowledge Stream */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Recent Captures</h2>
            <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Your authenticated user saved notes, media, and web links</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "3px 10px", borderRadius: 12 }}>
            {captures.length} saved
          </span>
        </div>

        {loadingCaptures && (
          <div style={{ textAlign: "center", padding: 30, color: "var(--ink-soft)", fontSize: 14 }}>
            <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading your saved captures from database…
          </div>
        )}

        {!loadingCaptures && captures.length === 0 && (
          <div className="empty" style={{ padding: 40, textAlign: "center", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px dashed var(--line)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>No saved captures yet</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
              Type a note, paste a link, upload a photo/PDF, or record a voice note above to save your first piece of knowledge.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {captures.map((item) => {
            const isVoice = item.kind === "voice" || (item.source_url && (item.source_url.endsWith(".webm") || item.source_url.endsWith(".wav") || item.source_url.endsWith(".mp3")));
            const isImage = item.kind === "image" || (item.source_url && /\.(png|jpg|jpeg|webp|gif)$/i.test(item.source_url));
            const isPdf = item.kind === "pdf" || (item.source_url && item.source_url.endsWith(".pdf"));
            const isLink = item.kind === "link" || item.source_url?.startsWith("http");

            return (
              <div
                key={item.id}
                style={{
                  background: "var(--surface)",
                  border: "1.5px solid var(--line)",
                  borderRadius: "var(--r)",
                  padding: 16,
                  boxShadow: "var(--sh-sm)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                      color: "var(--marigold-dark)",
                      background: "var(--marigold-light)",
                      padding: "2px 8px",
                      borderRadius: 10,
                    }}
                  >
                    {item.kind || "note"}
                  </span>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                      {new Date(item.created_at || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>

                    <button
                      onClick={() => handleDeleteCapture(item.id)}
                      title="Delete capture from database"
                      style={{ background: "none", border: "none", color: "var(--ink-faint)", cursor: "pointer", fontSize: 14, padding: 4 }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {item.title && (
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                    {item.title}
                  </div>
                )}

                {item.raw && item.raw !== item.title && !isVoice && (
                  <div style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {item.raw}
                  </div>
                )}

                {/* Web Link Preview */}
                {isLink && (item.source_url || item.raw) && (
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={item.source_url || item.raw}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 13, color: "#2563EB", textDecoration: "underline", wordBreak: "break-all" }}
                    >
                      🔗 {item.source_url || item.raw}
                    </a>
                  </div>
                )}

                {/* Photo / Diagram Display */}
                {isImage && item.source_url && (
                  <div style={{ marginTop: 10, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                    <img
                      src={item.source_url}
                      alt={item.title || "Saved image"}
                      style={{ maxHeight: 240, width: "100%", objectFit: "cover", display: "block" }}
                    />
                  </div>
                )}

                {/* PDF / Document Display */}
                {isPdf && item.source_url && (
                  <div style={{ marginTop: 8, padding: 10, background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>📄 {item.title || "PDF Document"}</span>
                    <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--marigold-dark)", fontWeight: 700, textDecoration: "underline" }}>
                      View PDF →
                    </a>
                  </div>
                )}

                {/* Voice Player Display */}
                {isVoice && item.source_url && (
                  <div style={{ marginTop: 10, padding: 10, background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--line)" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", marginBottom: 6 }}>🎙️ Voice Note Recording</div>
                    <audio controls src={item.source_url} style={{ width: "100%", height: 36 }} />
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