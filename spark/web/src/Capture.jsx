import React, { useState, useRef, useEffect, useCallback } from "react";
import { api } from "./api.js";
import { CardView } from "./App.jsx";

// ── Voice: Web Speech API ──────────
const SPEECH_OK = typeof window !== "undefined" &&
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

    rec.onend = () => { setListening(false); setInterim(""); };
    rec.onerror = (e) => {
      console.error("SpeechRecognition error:", e.error);
      setListening(false);
      setInterim("");
      const messages = {
        "not-allowed": "Mic permission blocked — check your browser's site settings.",
        "no-speech": "No speech detected — try again, speak right after tapping.",
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

const MODES = [
  { label: "Short note", icon: "📝", kind: "note" },
  { label: "Thought", icon: "💡", kind: "idea" },
  { label: "Web Link", icon: "🔗", kind: "link" },
  { label: "Image", icon: "🖼️", kind: "image" },
  { label: "Insight", icon: "🧠", kind: "insight" },
  { label: "Goal", icon: "🎯", kind: "goal" },
];

export default function Capture({ onSaved }) {
  const [text, setText] = useState("");
  const [activeMode, setActiveMode] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [justSaved, setSaved] = useState(false);
  const [streamCards, setStreamCards] = useState(null);

  const fileRef = useRef();
  const imageInputRef = useRef();
  const taRef = useRef();

  // Fetch recent cards stream on mount
  const loadStream = useCallback(() => {
    api.cards()
      .then(setStreamCards)
      .catch((e) => console.error("Failed to load stream:", e));
  }, []);

  useEffect(() => {
    loadStream();
  }, [loadStream]);

  const onTranscript = useCallback((t) => {
    setText((prev) => (prev ? prev.trim() + " " + t.trim() : t.trim()));
  }, []);

  const { listening, interim, start, stop } = useVoiceCapture({ onTranscript, onError: setErr });

  const toggleVoice = () => {
    setErr("");
    if (listening) { stop(); return; }
    if (!SPEECH_OK) {
      setErr("Voice needs Chrome — open this app in Chrome for mic support.");
      return;
    }
    const ok = start();
    if (!ok) setErr("Microphone access denied — allow it in browser settings.");
  };

  // Handle Image Selection
  const handleSelectedImage = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Please select a valid image file (PNG, JPG, WebP, GIF, HEIC).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErr("Image file size must be under 10MB.");
      return;
    }
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setActiveMode(MODES.find(m => m.kind === "image"));
    setErr("");
  };

  const clearImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl(null);
    if (activeMode?.kind === "image") setActiveMode(null);
  };

  // Clipboard Paste Detection for Images & Links
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            handleSelectedImage(file);
            break;
          }
        }
      }
    }
  };

  // URL auto-detection
  const handleTextChange = (val) => {
    setText(val);
    if (!activeMode && (val.includes("http://") || val.includes("https://"))) {
      const linkMode = MODES.find(m => m.kind === "link");
      if (linkMode) setActiveMode(linkMode);
    }
  };

  // Extract #tags from text
  const extractTags = (val) => {
    const matches = val.match(/#[a-zA-Z0-9_-]+/g);
    return matches ? matches.map(t => t.slice(1)) : [];
  };

  const save = async () => {
    const val = text.trim();
    if ((!val && !imageFile) || busy) return;
    if (listening) stop();

    setBusy(true);
    setErr("");

    const optimisticId = "temp-" + Date.now();
    const isImg = Boolean(imageFile);
    const kind = isImg ? "image" : activeMode ? activeMode.kind : (val.startsWith("http") ? "link" : "text");
    
    const optimisticCard = {
      id: optimisticId,
      raw: val || (isImg ? `Image: ${imageFile.name}` : ""),
      kind: kind,
      topic: activeMode ? activeMode.label : (isImg ? "Image" : ""),
      tags: extractTags(val),
      created_at: new Date().toISOString(),
      source_url: imagePreviewUrl || "",
      isOptimistic: true,
    };

    // 1. Optimistic UI insertion
    setStreamCards((prev) => [optimisticCard, ...(prev || [])]);
    const savedText = text;
    const savedFile = imageFile;
    const savedMode = activeMode;

    setText("");
    setImageFile(null);
    setImagePreviewUrl(null);
    setActiveMode(null);

    try {
      // 2. Persist to backend
      let res;
      if (savedFile) {
        res = await api.addFile(savedFile);
      } else {
        res = await api.addCard(kind, savedText);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      // 3. Reconcile optimistic card with backend result
      setStreamCards((prev) =>
        (prev || []).map((c) => (c.id === optimisticId ? (res.id ? res : { ...optimisticCard, ...res }) : c))
      );
      onSaved?.();
      taRef.current?.focus();
    } catch (e) {
      // 4. Revert optimistic card and restore user input on failure
      setStreamCards((prev) => (prev || []).filter((c) => c.id !== optimisticId));
      setText(savedText);
      setImageFile(savedFile);
      if (savedFile) setImagePreviewUrl(URL.createObjectURL(savedFile));
      setActiveMode(savedMode);
      setErr(e.message || "Failed to save card. Your input has been restored.");
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      save();
    }
  };

  const onDocFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      handleSelectedImage(file);
      e.target.value = "";
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await api.addFile(file);
      if (res && res.id) {
        setStreamCards((prev) => [res, ...(prev || [])]);
      } else {
        loadStream();
      }
      onSaved?.();
    } catch (err) {
      setErr(err.message || "File upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleDeleteStreamCard = async (id) => {
    try {
      await api.deleteCard(id);
      setStreamCards((prev) => (prev || []).filter((c) => c.id !== id));
      onSaved?.();
    } catch (e) {
      setErr(e.message || "Failed to delete card");
    }
  };

  const handleUpdateStreamCard = (updatedCard) => {
    setStreamCards((prev) =>
      (prev || []).map((c) => (c.id === updatedCard.id ? { ...c, ...updatedCard } : c))
    );
  };

  const hasContent = text.trim().length > 0 || Boolean(imageFile);
  const displayText = listening && interim ? text + (text ? " " : "") + interim : text;

  return (
    <div className="screen">
      <div className="eyebrow">Capture</div>
      <h1 className="title">What's worth keeping?</h1>
      <p className="sub">A note, thought, link, or image — drop it here. It instantly joins your second brain stream.</p>

      {err && <div className="err">{err}</div>}

      {/* Mode Chips Selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {MODES.map((m) => {
          const isSelected = activeMode?.kind === m.kind;
          return (
            <button
              key={m.kind}
              onClick={() => {
                if (m.kind === "image") {
                  imageInputRef.current?.click();
                } else {
                  setActiveMode(isSelected ? null : m);
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: isSelected ? "var(--marigold-light)" : "var(--surface-2)",
                border: `1.5px solid ${isSelected ? "var(--marigold)" : "var(--line)"}`,
                borderRadius: 20,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: isSelected ? 600 : 500,
                color: isSelected ? "var(--marigold-dark)" : "var(--ink-soft)",
                cursor: "pointer",
                transition: "all .15s ease",
                boxShadow: isSelected ? "0 2px 8px var(--marigold-glow)" : "none",
              }}
            >
              <span>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/heic"
        style={{ display: "none" }}
        onChange={(e) => handleSelectedImage(e.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/png,image/jpeg,image/heic,image/webp"
        style={{ display: "none" }}
        onChange={onDocFile}
      />

      {/* Capture Composer Box */}
      <div
        style={{
          background: "var(--surface)",
          border: `1.5px solid ${listening ? "#8B5CF6" : hasContent ? "var(--marigold)" : "var(--line)"}`,
          borderRadius: "var(--r)",
          boxShadow: listening
            ? "0 0 0 3px rgba(139,92,246,.15), var(--sh)"
            : hasContent
            ? "0 0 0 3px var(--marigold-glow), var(--sh)"
            : "var(--sh-sm)",
          overflow: "hidden",
          transition: "border-color .2s, box-shadow .2s",
        }}
      >
        {listening && (
          <div
            style={{
              background: "#8B5CF6",
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                background: "#fff",
                borderRadius: "50%",
                display: "inline-block",
                animation: "blink 1s ease infinite",
              }}
            />
            <span style={{ fontSize: 12.5, color: "#fff", fontWeight: 600 }}>
              Listening — speak now.
            </span>
          </div>
        )}

        {/* Image Preview Box */}
        {imagePreviewUrl && (
          <div
            style={{
              position: "relative",
              padding: "12px 16px 0",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                position: "relative",
                width: 72,
                height: 72,
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid var(--line)",
                background: "#000",
              }}
            >
              <img
                src={imagePreviewUrl}
                alt="Upload preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <button
                onClick={clearImage}
                title="Remove image"
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.7)",
                  color: "#fff",
                  border: "none",
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
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                {imageFile?.name || "Image ready to capture"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                {imageFile?.size ? `${Math.round(imageFile.size / 1024)} KB` : "Image upload"}
              </div>
            </div>
          </div>
        )}

        <textarea
          ref={taRef}
          value={displayText}
          onChange={(e) => !listening && handleTextChange(e.target.value)}
          onKeyDown={onKey}
          onPaste={handlePaste}
          placeholder={
            listening
              ? "Your words appear here as you speak…"
              : imageFile
              ? "Add a caption or note for this image (optional)…"
              : activeMode
              ? `Capture a ${activeMode.label.toLowerCase()}…`
              : "Jot a note, thought, paste a link, or drop an image…"
          }
          rows={imagePreviewUrl ? 2 : 4}
          readOnly={listening}
          disabled={busy}
          style={{
            width: "100%",
            display: "block",
            border: "none",
            outline: "none",
            background: "transparent",
            padding: "16px 16px 10px",
            fontSize: 15.5,
            fontFamily: "var(--sans)",
            color: listening ? "var(--ink-soft)" : "var(--ink)",
            resize: "none",
            lineHeight: 1.6,
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderTop: "1px solid var(--line)",
            background: "var(--surface-2)",
          }}
        >
          <button
            onClick={toggleVoice}
            disabled={busy}
            title={listening ? "Tap to stop" : "Voice note capture"}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              cursor: busy ? "not-allowed" : "pointer",
              flexShrink: 0,
              background: listening ? "#8B5CF6" : "var(--surface-3)",
              color: listening ? "#fff" : "var(--ink-soft)",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .15s",
              boxShadow: listening ? "0 0 0 3px rgba(139,92,246,.25)" : "none",
            }}
          >
            {listening ? "⏹" : "🎤"}
          </button>

          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={busy || listening}
            title="Upload photo or image"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              cursor: busy || listening ? "not-allowed" : "pointer",
              flexShrink: 0,
              background: imageFile ? "var(--marigold-light)" : "var(--surface-3)",
              color: imageFile ? "var(--marigold-dark)" : "var(--ink-soft)",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            🖼️
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy || listening}
            title="Upload PDF or document"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              cursor: busy || listening ? "not-allowed" : "pointer",
              flexShrink: 0,
              background: "var(--surface-3)",
              color: "var(--ink-soft)",
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            📄
          </button>

          <span style={{ flex: 1, fontSize: 12, color: "var(--ink-faint)", overflow: "hidden", whiteSpace: "nowrap" }}>
            {busy ? "Saving…" : listening ? "Tap ⏹ to stop" : imageFile ? "Image attached" : ""}
          </span>

          <button
            onClick={save}
            disabled={busy || !hasContent || listening}
            style={{
              background: hasContent && !busy && !listening ? "var(--marigold)" : "var(--surface-3)",
              color: hasContent && !busy && !listening ? "#fff" : "var(--ink-faint)",
              border: "none",
              borderRadius: 8,
              padding: "8px 22px",
              fontSize: 14,
              fontWeight: 600,
              flexShrink: 0,
              cursor: hasContent && !busy && !listening ? "pointer" : "not-allowed",
              transition: "all .18s",
              boxShadow: hasContent && !listening ? "0 3px 12px rgba(245,158,11,.35)" : "none",
            }}
          >
            {justSaved ? "✓ Saved" : busy ? "…" : "Save"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 28 }}>
        <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
          {activeMode ? `Mode: ${activeMode.label}` : "Paste images, URLs, or notes directly"}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>⌘ Enter to save</span>
      </div>

      {/* Knowledge Stream / Recent Captures Section */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="eyebrow" style={{ margin: 0, fontSize: 11 }}>
            Recent Captures {streamCards ? `(${streamCards.length})` : ""}
          </div>
        </div>

        {!streamCards && (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 84, marginBottom: 12, borderRadius: "var(--r)" }} />
            ))}
          </>
        )}

        {streamCards && streamCards.length === 0 && (
          <div className="empty" style={{ padding: "40px 20px" }}>
            <span className="empty-icon">✺</span>
            <h3 className="empty-title">Your knowledge stream starts here</h3>
            <p className="empty-sub">Capture a note, thought, link, or image above.</p>
          </div>
        )}

        {streamCards &&
          streamCards.map((c) => (
            <CardView key={c.id} c={c} onDelete={handleDeleteStreamCard} onUpdate={handleUpdateStreamCard} />
          ))}
      </div>

      <style>{`@keyframes blink{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
    </div>
  );
}