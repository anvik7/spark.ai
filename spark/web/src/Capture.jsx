import React, { useState, useRef, useEffect, useCallback } from "react";
import { api } from "./api.js";
import Avatar from "./components/Avatar.jsx";
import ConfirmationDialog from "./components/ui/ConfirmationDialog";

// Clean SVG Icons for Capture
const Ico = {
  mic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
};

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

    setListening(true);
    return true;
  }, [onTranscript, onError]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch {}
    try { mediaRecRef.current?.stop(); } catch {}
    setListening(false);
    setInterim("");
  }, []);

  return { listening, interim, recordedAudioBlob, start, stop };
}

// Helper: Classify capture type automatically based on input
function autoClassifyContent(text, selectedFile, recordedAudioBlob) {
  if (selectedFile) {
    if (selectedFile.type.startsWith("image/")) return "image";
    return "pdf";
  }
  if (recordedAudioBlob) return "voice";
  const trimmed = text.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return "link";
  return "note";
}

// Helper: Authenticated capture image preview with automatic Blob URL revocation
function CaptureImagePreview({ src, alt = "Capture preview" }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let currentUrl = null;

    if (!src) {
      setLoading(false);
      setError(true);
      return;
    }

    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setBlobUrl(src);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    api.fetchMediaBlob(src)
      .then((url) => {
        if (!active) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        currentUrl = url;
        setBlobUrl(url);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      active = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [src]);

  if (loading) {
    return (
      <div style={{ marginTop: 8, padding: "16px 12px", background: "var(--surface-2, #f9fafb)", borderRadius: 10, border: "1px solid var(--line, #e5e7eb)", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-faint, #6b7280)" }}>
        <span>⏳</span> Loading preview...
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--surface-2, #f9fafb)", borderRadius: 10, border: "1px dashed var(--line, #e5e7eb)", fontSize: 12, color: "var(--ink-faint, #6b7280)" }}>
        ⚠️ Image preview unavailable
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8, borderRadius: 10, overflow: "hidden", border: "1.5px solid var(--line, #e5e7eb)", maxWidth: 360, maxHeight: 260, background: "#000" }}>
      <img
        src={blobUrl}
        alt={alt}
        style={{ width: "100%", maxHeight: 260, objectFit: "contain", display: "block" }}
      />
    </div>
  );
}

async function handleDownloadAttachment(sourceUrl, fallbackName) {
  try {
    const blobUrl = await api.fetchMediaBlob(sourceUrl);
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fallbackName || sourceUrl.split("/").pop() || "attachment";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (err) {
    alert("Failed to download attachment: " + (err.message || "Access denied"));
  }
}

export default function Capture({ onNavigate }) {
  const [textInput, setTextInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [captures, setCaptures] = useState([]);
  const [loadingCaptures, setLoadingCaptures] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    return localStorage.getItem("spark_capture_onboarding_dismissed") === "true";
  });

  // Search & Filters
  const [searchFilter, setSearchFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // "all" | "note" | "link" | "file" | "voice"

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

  const handleVoiceTranscript = useCallback((transcribedText) => {
    setTextInput((prev) => (prev ? `${prev} ${transcribedText}` : transcribedText));
  }, []);

  const handleVoiceError = useCallback((errMessage) => {
    setErr(errMessage);
  }, []);

  const voice = useVoiceCapture({
    onTranscript: handleVoiceTranscript,
    onError: handleVoiceError,
  });

  const handleSaveCapture = async (e) => {
    e?.preventDefault();
    const cleanText = textInput.trim();
    if (!cleanText && !selectedFile && !voice.recordedAudioBlob) {
      setErr("Enter text, paste a link, attach a file, or record a voice note.");
      return;
    }

    setSaving(true);
    setErr("");

    try {
      const detectedKind = autoClassifyContent(cleanText, selectedFile, voice.recordedAudioBlob);
      let newCapture;

      if (selectedFile) {
        newCapture = await api.uploadCaptureFile(selectedFile);
      } else if (voice.recordedAudioBlob) {
        newCapture = await api.uploadCaptureVoice(voice.recordedAudioBlob);
      } else {
        const sourceUrl = detectedKind === "link" ? cleanText : "";
        newCapture = await api.createCapture(detectedKind, cleanText, sourceUrl);
      }

      setCaptures((prev) => [newCapture, ...prev]);
      setTextInput("");
      setSelectedFile(null);
      voice.stop();
      localStorage.setItem("spark_capture_onboarding_dismissed", "true");
      setOnboardingDismissed(true);
    } catch (e) {
      console.error("Failed to save capture:", e);
      setErr(e.message || "Failed to save capture. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await api.deleteCapture(deleteTargetId);
      setCaptures((prev) => prev.filter((c) => c.id !== deleteTargetId));
      setDeleteTargetId(null);
    } catch (e) {
      setErr(e.message || "Failed to delete capture.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCaptures = captures.filter((item) => {
    const q = searchFilter.trim().toLowerCase();
    const textMatch =
      !q ||
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.raw && item.raw.toLowerCase().includes(q)) ||
      (item.summary && item.summary.toLowerCase().includes(q));

    if (!textMatch) return false;
    if (activeFilter === "all") return true;
    if (activeFilter === "note") return item.kind === "note" || item.kind === "thought";
    if (activeFilter === "link") return item.kind === "link" || item.kind === "web";
    if (activeFilter === "file") return item.kind === "pdf" || item.kind === "image" || item.kind === "file";
    if (activeFilter === "voice") return item.kind === "voice";
    return true;
  });

  return (
    <div className="screen">
      {/* Page Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Capture</h1>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Save anything you want to remember.
        </p>
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 3, fontWeight: 500 }}>
          Write it down. Save an idea. Keep a thought for later.
        </div>
      </div>

      {/* Primary Friction-Free Single Composer */}
      <form
        onSubmit={handleSaveCapture}
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          padding: 16,
          boxShadow: "var(--sh-sm)",
          marginBottom: 20,
        }}
      >
        <textarea
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="What's on your mind? Write a note, paste a link, or save an idea…"
          rows={3}
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            fontSize: 14.5,
            lineHeight: 1.5,
            fontFamily: "var(--sans)",
            background: "transparent",
            resize: "vertical",
            color: "var(--ink)",
            marginBottom: 10,
          }}
        />

        {/* Live Voice Recording Transcript Bar */}
        {voice.listening && (
          <div style={{ padding: "8px 12px", background: "var(--primary-light)", borderRadius: 8, fontSize: 13, color: "var(--primary)", fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {Ico.mic} Listening… {voice.interim && `"${voice.interim}"`}
            </span>
            <button type="button" onClick={voice.stop} style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 700, cursor: "pointer" }}>Stop</button>
          </div>
        )}

        {/* Selected File Badge */}
        {selectedFile && (
          <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--line)", fontSize: 12.5, color: "var(--ink)", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {Ico.file} {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
            </span>
            <button type="button" onClick={() => setSelectedFile(null)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
          </div>
        )}

        {err && <div className="err" style={{ marginBottom: 10, fontSize: 13 }}>{err}</div>}

        {/* Composer Action Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* "+" Icon Attachment Control */}
            <label
              title="Attach image, document, or file"
              style={{
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                borderRadius: "50%",
                border: "1.5px solid var(--line)",
                background: "var(--surface-2)",
                fontSize: 20,
                fontWeight: 600,
                cursor: "pointer",
                color: "var(--ink)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "border-color .15s ease",
              }}
            >
              +
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />
            </label>

            {/* Microphone Icon Control */}
            <button
              type="button"
              onClick={voice.listening ? voice.stop : voice.start}
              title={voice.listening ? "Stop voice" : "Voice note"}
              style={{
                width: 44,
                height: 44,
                minWidth: 44,
                minHeight: 44,
                borderRadius: "50%",
                border: voice.listening ? "1.5px solid var(--primary)" : "1.5px solid var(--line)",
                background: voice.listening ? "var(--primary-light)" : "var(--surface-2)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: voice.listening ? "var(--primary)" : "var(--ink)",
                transition: "all .15s ease",
              }}
            >
              {Ico.mic}
            </button>
          </div>

          <button
            type="submit"
            disabled={saving || (!textInput.trim() && !selectedFile && !voice.recordedAudioBlob)}
            style={{
              minHeight: 44,
              padding: "10px 22px",
              borderRadius: "var(--r-s)",
              border: "none",
              background: saving || (!textInput.trim() && !selectedFile && !voice.recordedAudioBlob) ? "var(--line)" : "var(--p-gradient)",
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: 700,
              cursor: saving || (!textInput.trim() && !selectedFile && !voice.recordedAudioBlob) ? "not-allowed" : "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {/* Search & Saved Captures Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Saved Captures</h2>
        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>{filteredCaptures.length} items</div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 14 }}>
        {[
          { id: "all", label: "All" },
          { id: "note", label: "Notes" },
          { id: "link", label: "Links" },
          { id: "file", label: "Files" },
          { id: "voice", label: "Voice" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 12.5,
              fontWeight: 600,
              border: activeFilter === f.id ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
              background: activeFilter === f.id ? "var(--marigold-light)" : "var(--surface)",
              color: activeFilter === f.id ? "var(--marigold-dark)" : "var(--ink)",
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Saved Captures List */}
      {loadingCaptures && (
        <div style={{ textAlign: "center", padding: 24, fontSize: 13, color: "var(--ink-soft)" }}>
          Loading saved captures…
        </div>
      )}

      {/* New User Onboarding Introduction Card */}
      {!loadingCaptures && captures.length === 0 && !onboardingDismissed && (
        <div
          style={{
            background: "var(--surface)",
            border: "1.5px solid var(--line)",
            borderRadius: 14,
            padding: "20px 22px",
            marginBottom: 20,
            boxShadow: "var(--sh-sm)",
            position: "relative",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setOnboardingDismissed(true);
              localStorage.setItem("spark_capture_onboarding_dismissed", "true");
            }}
            title="Dismiss onboarding"
            style={{
              position: "absolute",
              top: 12,
              right: 14,
              background: "none",
              border: "none",
              color: "var(--ink-soft)",
              fontSize: 14,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ✕
          </button>

          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink)", marginBottom: 16, paddingRight: 16 }}>
            <div style={{ marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: "var(--marigold-dark)", fontWeight: 700 }}>•</span>
              <span>Minimalist note-taking, supports AI-powered speech-to-text conversion.</span>
            </div>
            <div style={{ marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: "var(--marigold-dark)", fontWeight: 700 }}>•</span>
              <span>AI insights, uncovering the wisdom behind the notes.</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: "var(--marigold-dark)", fontWeight: 700 }}>•</span>
              <span>Daily review allows your notes to continuously generate compound interest.</span>
            </div>
          </div>

          <div
            style={{
              padding: "12px 16px",
              background: "var(--marigold-light)",
              borderRadius: 10,
              border: "1px solid var(--line)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--marigold-dark)",
              fontStyle: "italic",
              lineHeight: 1.5,
            }}
          >
            “Try writing down the inspirations and emotions that come to mind right now, and experience the joy of stress-free recording.”
          </div>
        </div>
      )}

      {!loadingCaptures && captures.length > 0 && filteredCaptures.length === 0 && (
        <div style={{ padding: "28px 16px", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>No matching captures found</div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
            Try adjusting your search query or filter.
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filteredCaptures.map((c) => (
          <div
            key={c.id}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: 14,
              boxShadow: "var(--sh-sm)",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "2px 6px", borderRadius: 6 }}>
                  {c.kind || (c.tags && c.tags[0]) || "capture"}
                </span>

                {c.creator_name && (
                  <>
                    <span style={{ fontSize: 11, color: "var(--line)" }}>|</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>
                      <Avatar src={c.creator_avatar} name={c.creator_name} size={16} />
                      <span>{c.creator_name.startsWith("@") ? c.creator_name : `@${c.creator_name}`}</span>
                    </span>
                  </>
                )}

                <span style={{ fontSize: 11, color: "var(--line)" }}>•</span>
                <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 500 }}>
                  {new Date(c.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>

              <button
                onClick={() => setDeleteTargetId(c.id)}
                title="Delete capture"
                style={{ background: "none", border: "none", color: "var(--ink-faint)", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {c.raw || c.title || c.summary || "Untitled Capture"}
            </div>

            {/* Real AI Insight Badge if summary is available and distinct */}
            {c.summary && c.summary !== c.raw && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--primary-light)", borderRadius: 8, border: "1px solid var(--line)", fontSize: 12.5, color: "var(--ink)", lineHeight: 1.45 }}>
                <span style={{ fontWeight: 700, color: "var(--primary)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {Ico.spark} SparkDhi Insight:
                </span>{" "}
                <span>{c.summary}</span>
              </div>
            )}

            {c.source_url && (
              <>
                {c.kind === "image" ? (
                  <CaptureImagePreview src={c.source_url} alt={c.title || "Capture image"} />
                ) : null}

                {c.source_url.startsWith("/api/uploads/") ? (
                  <button
                    onClick={() => handleDownloadAttachment(c.source_url, c.title || "attachment")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "4px 0",
                      fontSize: 12,
                      color: "var(--primary)",
                      textDecoration: "underline",
                      marginTop: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {Ico.file} Download {c.kind === "pdf" ? "PDF Document" : (c.kind === "voice" ? "Voice Note" : "Attachment")}
                  </button>
                ) : (
                  <a
                    href={c.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "var(--primary)", textDecoration: "none", marginTop: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    {Ico.link} {c.source_url}
                  </a>
                )}
              </>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
              <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                {new Date(c.created_at || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {c.is_public && c.share_token ? (
                  <>
                    <button
                      onClick={async () => {
                        const url = `${window.location.origin}/shared/capture/${c.share_token}`;
                        await navigator.clipboard?.writeText(url);
                        alert("Public link copied to clipboard:\n" + url);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--line)",
                        background: "var(--primary-light)",
                        color: "var(--primary)",
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {Ico.copy} Copy Link
                    </button>
                    <button
                      onClick={async () => {
                        await api.unshareCapture(c.id);
                        setCaptures((prev) =>
                          prev.map((item) => (item.id === c.id ? { ...item, is_public: false, share_token: null } : item))
                        );
                      }}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--line)",
                        background: "var(--surface-2)",
                        color: "var(--ink-soft)",
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Revoke
                    </button>
                  </>
                ) : (
                  <button
                    onClick={async () => {
                      const res = await api.shareCapture(c.id);
                      setCaptures((prev) =>
                        prev.map((item) => (item.id === c.id ? { ...item, is_public: true, share_token: res.share_token } : item))
                      );
                      const url = `${window.location.origin}${res.share_url}`;
                      await navigator.clipboard?.writeText(url);
                      alert("Public share link created & copied:\n" + url);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "1px solid var(--line)",
                      background: "var(--surface-2)",
                      color: "var(--ink)",
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {Ico.link} Share
                  </button>
                )}

              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationDialog
        isOpen={!!deleteTargetId}
        title="Delete Capture?"
        message="Are you sure you want to delete this item? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDanger={true}
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  );
}