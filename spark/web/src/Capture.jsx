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
  { label: "Idea", icon: "💡", kind: "idea" },
  { label: "Link", icon: "🔗", kind: "link" },
  { label: "Study note", icon: "📚", kind: "note" },
  { label: "Insight", icon: "🧠", kind: "insight" },
  { label: "Goal", icon: "🎯", kind: "goal" },
];

export default function Capture({ onSaved }) {
  const [text, setText] = useState("");
  const [activeMode, setActiveMode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [justSaved, setSaved] = useState(false);
  const [streamCards, setStreamCards] = useState(null);

  const fileRef = useRef();
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
    if (!val || busy) return;
    if (listening) stop();

    setBusy(true);
    setErr("");

    const kind = activeMode ? activeMode.kind : (val.startsWith("http") ? "link" : "text");
    const optimisticId = "temp-" + Date.now();
    const optimisticCard = {
      id: optimisticId,
      raw: val,
      kind: kind,
      topic: activeMode ? activeMode.label : "",
      tags: extractTags(val),
      created_at: new Date().toISOString(),
      isOptimistic: true,
    };

    // 1. Optimistic UI insertion
    setStreamCards((prev) => [optimisticCard, ...(prev || [])]);
    setText("");
    const savedMode = activeMode;
    setActiveMode(null);

    try {
      // 2. Persist to backend
      const res = await api.addCard(kind, val);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      // 3. Reconcile optimistic card with backend result
      setStreamCards((prev) =>
        (prev || []).map((c) => (c.id === optimisticId ? (res.id ? res : { ...optimisticCard, ...res }) : c))
      );
      onSaved?.();
      taRef.current?.focus();
    } catch (e) {
      // 4. Revert optimistic card and restore user input text on failure
      setStreamCards((prev) => (prev || []).filter((c) => c.id !== optimisticId));
      setText(val);
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

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

  const hasText = text.trim().length > 0;
  const displayText = listening && interim ? text + (text ? " " : "") + interim : text;

  return (
    <div className="screen">
      <div className="eyebrow">Capture</div>
      <h1 className="title">What's worth keeping?</h1>
      <p className="sub">A thought, a link, an insight — drop it here. It instantly joins your stream.</p>

      {err && <div className="err">{err}</div>}

      {/* Mode Chips Selector */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {MODES.map((m) => {
          const isSelected = activeMode?.kind === m.kind;
          return (
            <button
              key={m.kind}
              onClick={() => setActiveMode(isSelected ? null : m)}
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

      {/* Capture Composer Box */}
      <div
        style={{
          background: "var(--surface)",
          border: `1.5px solid ${listening ? "#8B5CF6" : hasText ? "var(--marigold)" : "var(--line)"}`,
          borderRadius: "var(--r)",
          boxShadow: listening
            ? "0 0 0 3px rgba(139,92,246,.15), var(--sh)"
            : hasText
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

        <textarea
          ref={taRef}
          value={displayText}
          onChange={(e) => !listening && handleTextChange(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            listening
              ? "Your words appear here as you speak…"
              : activeMode
              ? `Capture a ${activeMode.label.toLowerCase()}…`
              : "Jot a thought, paste a link, drop an insight…"
          }
          rows={4}
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
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/png,image/jpeg,image/heic,image/webp"
            style={{ display: "none" }}
            onChange={onFile}
          />

          <span style={{ flex: 1, fontSize: 12, color: "var(--ink-faint)", overflow: "hidden", whiteSpace: "nowrap" }}>
            {busy ? "Saving…" : listening ? "Tap ⏹ to stop" : ""}
          </span>

          <button
            onClick={save}
            disabled={busy || !hasText || listening}
            style={{
              background: hasText && !busy && !listening ? "var(--marigold)" : "var(--surface-3)",
              color: hasText && !busy && !listening ? "#fff" : "var(--ink-faint)",
              border: "none",
              borderRadius: 8,
              padding: "8px 22px",
              fontSize: 14,
              fontWeight: 600,
              flexShrink: 0,
              cursor: hasText && !busy && !listening ? "pointer" : "not-allowed",
              transition: "all .18s",
              boxShadow: hasText && !listening ? "0 3px 12px rgba(245,158,11,.35)" : "none",
            }}
          >
            {justSaved ? "✓ Saved" : busy ? "…" : "Save"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 28 }}>
        <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
          {activeMode ? `Mode: ${activeMode.label}` : "Auto-detecting note type"}
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
            <p className="empty-sub">Capture a thought, link, idea, or insight above.</p>
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