import React, { useState, useRef, useEffect, useCallback } from "react";
import { api } from "./api.js";
import ConfirmationDialog from "./components/ui/ConfirmationDialog";

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
            stream.getTracks().forEach((t) => t.stop());
          };
          mr.start();
          setListening(true);
        })
        .catch((err) => {
          console.warn("getUserMedia error:", err);
          if (!SPEECH_OK) onError("Microphone permission denied or unsupported.");
        });
    }

    return true;
  }, [onTranscript, onError]);

  const stop = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      try { mediaRecRef.current.stop(); } catch {}
    }
    setListening(false);
    setInterim("");
  }, []);

  return { listening, interim, recordedAudioBlob, setRecordedAudioBlob, start, stop };
}

export default function Capture({ onSaved }) {
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  // Feed list & search state
  const [captures, setCaptures] = useState([]);
  const [loadingCaptures, setLoadingCaptures] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "notes" | "links" | "files" | "voice"

  // Deletion Modal state
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCaptures = useCallback(() => {
    setLoadingCaptures(true);
    api.getCaptures()
      .then((items) => {
        setCaptures(items || []);
      })
      .catch((e) => {
        console.error("Failed to load captures:", e);
        setErr(e.message || "Failed to load saved captures.");
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
      setErr("Please type a note, paste a link, or attach a file to save.");
      return;
    }

    setBusy(true);
    setErr("");

    try {
      let savedItem;

      if (recordedAudioBlob) {
        savedItem = await api.uploadCaptureVoice(recordedAudioBlob);
      } else if (selectedFile) {
        savedItem = await api.uploadCaptureFile(selectedFile);
      } else {
        const isUrl = /^https?:\/\//i.test(rawText);
        const autoKind = isUrl ? "link" : "text";
        savedItem = await api.createCapture(autoKind, rawText, isUrl ? rawText : "");
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
      setErr(error.message || "Failed to save capture.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteCapture = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await api.deleteCapture(deleteTargetId);
      setCaptures((prev) => prev.filter((c) => c.id !== deleteTargetId));
      setDeleteTargetId(null);
    } catch (error) {
      console.error("Failed to delete capture:", error);
      setErr(error.message || "Failed to delete capture.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCaptures = captures.filter((c) => {
    const matchesSearch = !searchFilter.trim() ||
      (c.title && c.title.toLowerCase().includes(searchFilter.toLowerCase())) ||
      (c.raw && c.raw.toLowerCase().includes(searchFilter.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeFilter === "all") return true;
    if (activeFilter === "links") return c.kind === "link" || c.source_url?.startsWith("http");
    if (activeFilter === "files") return c.kind === "pdf" || c.kind === "image" || (c.source_url && !c.source_url.startsWith("http"));
    if (activeFilter === "voice") return c.kind === "voice";
    if (activeFilter === "notes") return c.kind === "text" || c.kind === "note" || c.kind === "idea" || !c.kind;
    return true;
  });

  return (
    <div className="screen">
      <ConfirmationDialog
        isOpen={Boolean(deleteTargetId)}
        title="Delete capture?"
        description="This will permanently delete this item from your workspace. This action cannot be undone."
        confirmLabel="Delete item"
        cancelLabel="Cancel"
        isDanger={true}
        busy={isDeleting}
        onConfirm={confirmDeleteCapture}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* Action Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Capture</h1>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Save anything you want to remember.
        </p>
      </div>

      {/* Universal Friction-Free Composer */}
      <form
        onSubmit={handleSaveCapture}
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: 16,
          boxShadow: "var(--sh-sm)",
          marginBottom: 20,
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's on your mind? Paste a link, write a note, or record an idea..."
          rows={3}
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            fontSize: 15,
            lineHeight: 1.5,
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

        {err && <div className="err" style={{ marginBottom: 10, fontSize: 13 }}>⚠️ {err}</div>}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach image or file document"
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "var(--ink)",
              }}
            >
              📁 Add image or file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt"
              style={{ display: "none" }}
              onChange={(e) => handleSelectFile(e.target.files?.[0])}
            />

            <button
              type="button"
              onClick={toggleVoice}
              title={listening ? "Stop recording" : "Record voice note"}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: listening ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                background: listening ? "var(--marigold-light)" : "var(--surface-2)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: listening ? "var(--marigold-dark)" : "var(--ink)",
              }}
            >
              <span>🎙️</span>
              <span>{listening ? "Stop" : "Voice"}</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={busy || (!text.trim() && !selectedFile && !recordedAudioBlob)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: busy || (!text.trim() && !selectedFile && !recordedAudioBlob) ? "var(--line)" : "var(--p-gradient)",
              color: "#FFFFFF",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: busy || (!text.trim() && !selectedFile && !recordedAudioBlob) ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Saving…" : justSaved ? "✓ Saved!" : "Save"}
          </button>
        </div>
      </form>

      {/* Recent Captures Inbox / Feed */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Recent Captures</h2>
          <div style={{ display: "flex", gap: 6 }}>
            {["all", "notes", "links", "files", "voice"].map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  border: activeFilter === f ? "1px solid var(--marigold)" : "1px solid var(--line)",
                  background: activeFilter === f ? "var(--marigold-light)" : "var(--surface-2)",
                  color: activeFilter === f ? "var(--marigold-dark)" : "var(--ink-soft)",
                  cursor: "pointer",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loadingCaptures && (
          <div style={{ textAlign: "center", padding: 30, color: "var(--ink-soft)", fontSize: 13.5 }}>
            <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading saved captures…
          </div>
        )}

        {!loadingCaptures && filteredCaptures.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 16px", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Nothing saved yet</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
              Capture something above to start building your knowledge inbox.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredCaptures.map((item) => {
            const isVoice = item.kind === "voice" || (item.source_url && (item.source_url.endsWith(".webm") || item.source_url.endsWith(".wav") || item.source_url.endsWith(".mp3")));
            const isImage = item.kind === "image" || (item.source_url && /\.(png|jpg|jpeg|webp|gif)$/i.test(item.source_url));
            const isPdf = item.kind === "pdf" || (item.source_url && item.source_url.endsWith(".pdf"));
            const isLink = item.kind === "link" || item.source_url?.startsWith("http");

            return (
              <div
                key={item.id}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: 14,
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
                      borderRadius: 8,
                    }}
                  >
                    {item.kind || "note"}
                  </span>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                      {new Date(item.created_at || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>

                    <button
                      onClick={() => setDeleteTargetId(item.id)}
                      title="Delete capture"
                      style={{ background: "none", border: "none", color: "var(--ink-faint)", cursor: "pointer", fontSize: 14, padding: 2 }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {item.title && (
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                    {item.title}
                  </div>
                )}

                {item.raw && item.raw !== item.title && !isVoice && (
                  <div style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {item.raw}
                  </div>
                )}

                {isLink && (item.source_url || item.raw) && (
                  <div style={{ marginTop: 6 }}>
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

                {isImage && item.source_url && (
                  <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                    <img
                      src={item.source_url}
                      alt={item.title || "Saved image"}
                      style={{ maxHeight: 200, width: "100%", objectFit: "cover", display: "block" }}
                    />
                  </div>
                )}

                {isPdf && item.source_url && (
                  <div style={{ marginTop: 8, padding: 8, background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>📄 {item.title || "PDF Document"}</span>
                    <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--marigold-dark)", fontWeight: 700, textDecoration: "underline" }}>
                      View →
                    </a>
                  </div>
                )}

                {isVoice && item.source_url && (
                  <div style={{ marginTop: 8, padding: 8, background: "var(--surface-2)", borderRadius: 6, border: "1px solid var(--line)" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--marigold-dark)", marginBottom: 4 }}>🎙️ Voice Recording</div>
                    <audio controls src={item.source_url} style={{ width: "100%", height: 32 }} />
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