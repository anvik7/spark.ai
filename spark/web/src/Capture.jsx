import React, { useState, useRef, useEffect, useCallback } from "react";

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
      onError?.("Mic permission error — check browser microphone settings.");
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

const CAPTURE_MODES = [
  { label: "Short Note", icon: "📝", kind: "note" },
  { label: "Thought", icon: "💡", kind: "idea" },
  { label: "Web Link", icon: "🔗", kind: "link" },
  { label: "Photo / Diagram", icon: "🖼️", kind: "image" },
  { label: "PDF / Doc", icon: "📄", kind: "pdf" },
  { label: "Voice Note", icon: "🎙️", kind: "voice" },
];

const INITIAL_CAPTURES = [
  {
    id: "cap-demo-1",
    kind: "note",
    title: "Linear Algebra Vectors & Subspaces",
    text: "A subspace V of R^n is a subset closed under addition and scalar multiplication.",
    created_at: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "cap-demo-2",
    kind: "link",
    title: "Visualizing Neural Networks & Backpropagation",
    text: "https://3blue1brown.com/topics/neural-networks",
    url: "https://3blue1brown.com/topics/neural-networks",
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
];

export default function Capture({ onSaved }) {
  const [text, setText] = useState("");
  const [activeKind, setActiveKind] = useState("note");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [justSaved, setSaved] = useState(false);

  // Saved Knowledge Stream
  const [captures, setCaptures] = useState(() => {
    try {
      const saved = localStorage.getItem("spark_saved_captures");
      return saved ? JSON.parse(saved) : INITIAL_CAPTURES;
    } catch {
      return INITIAL_CAPTURES;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("spark_saved_captures", JSON.stringify(captures));
    } catch (e) {
      console.error("Failed to persist saved captures:", e);
    }
  }, [captures]);

  const fileInputRef = useRef();
  const textareaRef = useRef();

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
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setErr("Please select an image file (PNG, JPG, WebP) or PDF document.");
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

  const handleSaveCapture = (e) => {
    e?.preventDefault();
    const rawText = text.trim();
    if (!rawText && !imageFile) return;

    setBusy(true);
    setErr("");

    try {
      const isUrl = /^https?:\/\//i.test(rawText);
      const kind = isUrl ? "link" : imageFile ? "image" : activeKind;

      const newCapture = {
        id: `cap-${Date.now()}`,
        kind,
        title: isUrl ? rawText : rawText.length > 70 ? rawText.slice(0, 70) + "…" : rawText || "Saved Photo / File",
        text: rawText,
        url: isUrl ? rawText : null,
        imageUrl: imagePreviewUrl,
        created_at: new Date().toISOString(),
      };

      setCaptures((prev) => [newCapture, ...prev]);

      setText("");
      clearImage();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      onSaved?.();
    } catch (error) {
      setErr(error.message || "Failed to save capture.");
    } finally {
      setBusy(false);
    }
  };

  const deleteCapture = (id) => {
    setCaptures((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="screen">
      {/* Knowledge Saver Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ color: "var(--marigold-dark)" }}>Personal Knowledge Engine</div>
        <h1 className="title" style={{ fontSize: 26, margin: 0 }}>What do you want to save?</h1>
        <p className="sub" style={{ margin: "4px 0 0", fontSize: 14 }}>
          Capture notes, thoughts, web clippings, links, photos or voice notes to save to your personal second brain.
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

        {listening && interim && (
          <div style={{ padding: "6px 10px", background: "var(--marigold-light)", borderRadius: 8, fontSize: 13, color: "var(--marigold-dark)", marginBottom: 10 }}>
            🎙️ Recording voice note: <i>{interim}</i>
          </div>
        )}

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
              accept="image/*,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => handleImageFile(e.target.files?.[0])}
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
            {justSaved ? "Saved! ✓" : "Save Knowledge →"}
          </button>
        </div>
      </form>

      {/* Recent Captures / Saved Knowledge */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Recent Captures</h2>
            <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Your saved notes, web clippings, and study media</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "3px 10px", borderRadius: 12 }}>
            {captures.length} saved
          </span>
        </div>

        {captures.length === 0 && (
          <div className="empty" style={{ padding: 40, textAlign: "center", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px dashed var(--line)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>No saved captures yet</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
              Type a note, paste a link, or record a voice note above to save your first piece of knowledge.
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {captures.map((item) => (
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
                  {item.kind || "Note"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
                    {new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                  <button
                    onClick={() => deleteCapture(item.id)}
                    title="Delete capture"
                    style={{ background: "none", border: "none", color: "var(--ink-faint)", cursor: "pointer", fontSize: 14 }}
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

              {item.text && item.text !== item.title && (
                <div style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {item.text}
                </div>
              )}

              {item.url && (
                <div style={{ marginTop: 8 }}>
                  <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#2563EB", textDecoration: "underline", wordBreak: "break-all" }}>
                    🔗 {item.url}
                  </a>
                </div>
              )}

              {item.imageUrl && (
                <div style={{ marginTop: 10, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
                  <img src={item.imageUrl} alt="Saved thumbnail" style={{ maxHeight: 200, width: "100%", objectFit: "cover" }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}