import React, { useState, useRef, useCallback } from "react";

// ── Voice: Web Speech API (Chrome native, no backend ASR needed) ──────────
const SPEECH_OK = typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

function useVoiceCapture({ onTranscript, onError }) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const start = useCallback(() => {
    if (!SPEECH_OK) return false;
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new R();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onresult = (e) => {
      let final = "", inter = "";
      for (const r of e.results) {
        if (r.isFinal) final += r[0].transcript;
        else inter += r[0].transcript;
      }
      if (final) onTranscript(final);
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
        "network": "Voice needs internet access to Google's speech service — check your connection.",
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

async function req(method, path, body) {
  const token = localStorage.getItem("spark_token") || "";
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Error");
  return data;
}

async function addFile(file) {
  const token = localStorage.getItem("spark_token") || "";
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/cards/file", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Upload error");
  return data;
}

const QUICK = [
  ["💡","Idea"],["🔗","Link"],["📚","Study note"],["🧠","Insight"],["🎯","Goal"],
];

export default function Capture({ onSaved }) {
  const [text,      setText]  = useState("");
  const [busy,      setBusy]  = useState(false);
  const [err,       setErr]   = useState("");
  const [justSaved, setSaved] = useState(false);
  const fileRef = useRef();
  const taRef   = useRef();

  const onTranscript = useCallback((t) => {
    setText(prev => prev ? prev.trim() + " " + t.trim() : t.trim());
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

  const save = async () => {
    const val = text.trim();
    if (!val || busy) return;
    if (listening) stop();
    setBusy(true); setErr("");
    try {
      await req("POST", "/api/cards", { kind: "text", raw: val });
      setText(""); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved?.();
      taRef.current?.focus();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setErr("");
    try { await addFile(file); onSaved?.(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); e.target.value = ""; }
  };

  const hasText = text.trim().length > 0;
  const displayText = listening && interim
    ? text + (text ? " " : "") + interim
    : text;

  return (
    <div className="screen">
      <div className="eyebrow">Capture</div>
      <h1 className="title">What's worth keeping?</h1>
      <p className="sub">A thought, a link, a line from a PDF — drop it here like a private tweet.</p>

      {err && <div className="err">{err}</div>}

      <div style={{
        background: "var(--surface)",
        border: `1.5px solid ${listening ? "#8B5CF6" : hasText ? "var(--marigold)" : "var(--line)"}`,
        borderRadius: "var(--r)",
        boxShadow: listening
          ? "0 0 0 3px rgba(139,92,246,.15), var(--sh)"
          : hasText ? "0 0 0 3px var(--marigold-glow), var(--sh)" : "var(--sh-sm)",
        overflow: "hidden",
        transition: "border-color .2s, box-shadow .2s",
      }}>
        {listening && (
          <div style={{
            background: "#8B5CF6", padding: "7px 14px",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 8, height: 8, background: "#fff", borderRadius: "50%",
              display: "inline-block", animation: "blink 1s ease infinite",
            }} />
            <span style={{ fontSize: 12, color: "#fff", fontWeight: 500 }}>
              Listening — speak now.
            </span>
          </div>
        )}

        <textarea
          ref={taRef}
          value={displayText}
          onChange={e => !listening && setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={listening
            ? "Your words appear here as you speak…"
            : "Jot a thought, paste a link, drop a URL…"}
          rows={5}
          readOnly={listening}
          disabled={busy}
          style={{
            width: "100%", display: "block",
            border: "none", outline: "none", background: "transparent",
            padding: "16px 16px 10px", fontSize: 16,
            fontFamily: "var(--sans, Inter, system-ui, sans-serif)",
            color: listening ? "var(--ink-soft)" : "var(--ink)",
            resize: "none", lineHeight: 1.65,
          }}
        />

        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 12px",
          borderTop: "1px solid var(--line)",
          background: "var(--surface-2)",
        }}>
          <button onClick={toggleVoice} disabled={busy}
            title={listening ? "Tap to stop" : "Voice note — Hindi/Telugu works"}
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              cursor: busy ? "not-allowed" : "pointer", flexShrink: 0,
              background: listening ? "#8B5CF6" : "var(--surface-3, #F1F3F5)",
              color: listening ? "#fff" : "var(--ink-soft)",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all .15s",
              boxShadow: listening ? "0 0 0 3px rgba(139,92,246,.25)" : "none",
            }}>
            {listening ? "⏹" : "🎤"}
          </button>

          <button onClick={() => fileRef.current?.click()} disabled={busy || listening}
            title="Upload PDF or image"
            style={{
              width: 36, height: 36, borderRadius: "50%", border: "none",
              cursor: (busy || listening) ? "not-allowed" : "pointer", flexShrink: 0,
              background: "var(--surface-3, #F1F3F5)", color: "var(--ink-soft)",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            📄
          </button>
          <input ref={fileRef} type="file" accept=".pdf,image/png,image/jpeg,image/heic,image/webp"
            style={{ display: "none" }} onChange={onFile} />

          <span style={{ flex: 1, fontSize: 12, color: "var(--ink-faint)", overflow: "hidden", whiteSpace: "nowrap" }}>
            {busy ? "Saving…" : listening ? "Tap ⏹ to stop, then edit if needed" : ""}
          </span>

          <button onClick={save} disabled={busy || !hasText || listening}
            style={{
              background: (hasText && !busy && !listening) ? "var(--marigold)" : "var(--surface-3)",
              color: (hasText && !busy && !listening) ? "#fff" : "var(--ink-faint)",
              border: "none", borderRadius: 8, padding: "8px 20px",
              fontSize: 14, fontWeight: 600, flexShrink: 0,
              cursor: (hasText && !busy && !listening) ? "pointer" : "not-allowed",
              transition: "all .18s",
              boxShadow: (hasText && !listening) ? "0 2px 10px rgba(245,158,11,.3)" : "none",
            }}>
            {justSaved ? "✓ Saved" : busy ? "…" : "Save"}
          </button>
        </div>
      </div>

      <p style={{ textAlign: "right", fontSize: 11.5, color: "var(--ink-faint)", marginTop: 6 }}>
        ⌘ Enter to save
      </p>

      <div style={{ marginTop: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Quick capture</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {QUICK.map(([icon, label]) => (
            <button key={label}
              onClick={() => { setText(t => t || `[${label}] `); taRef.current?.focus(); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "var(--surface-2)", border: "1px solid var(--line)",
                borderRadius: 20, padding: "6px 14px",
                fontSize: 13, fontWeight: 500, color: "var(--ink-soft)",
                cursor: "pointer", transition: "all .12s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "var(--marigold-light,#FEF9EC)";
                e.currentTarget.style.borderColor = "var(--marigold)";
                e.currentTarget.style.color = "var(--marigold-dark,#D97706)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "var(--surface-2)";
                e.currentTarget.style.borderColor = "var(--line)";
                e.currentTarget.style.color = "var(--ink-soft)";
              }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>
      <style>{`@keyframes blink{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
    </div>
  );
}
