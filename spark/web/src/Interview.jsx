import React, { useState, useRef, useEffect, useCallback } from "react";

const ROUNDS = ["HR Screen", "Technical Deep-Dive", "Hiring Manager"];
const PER_ROUND = 3;

// ── Web Speech helpers ──────────────────────────────────────────────────────
const SPEECH_OK = typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

function speak(text, onEnd) {
  if (!window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95; u.pitch = 1; u.lang = "en-IN";
  // prefer a natural English voice
  const voices = window.speechSynthesis.getVoices();
  const pick = voices.find(v => v.lang.startsWith("en") && v.localService) || voices[0];
  if (pick) u.voice = pick;
  u.onend = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

function useSpeechRec({ onResult, onEnd }) {
  const recRef = useRef(null);
  const start = useCallback(() => {
    if (!SPEECH_OK) return;
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new R();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onresult = e => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join(" ");
      onResult(transcript);
    };
    rec.onend = () => onEnd?.();
    rec.start();
    recRef.current = rec;
  }, [onResult, onEnd]);
  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
  }, []);
  return { start, stop };
}

// ── API ─────────────────────────────────────────────────────────────────────
async function apiCall(body) {
  const token = localStorage.getItem("spark_token") || "";
  const res = await fetch("/api/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Interview error");
  return data;
}

// ── Mic button ───────────────────────────────────────────────────────────────
function MicBtn({ listening, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={listening ? "Stop recording" : "Speak answer"}
      style={{
        width: 56, height: 56, borderRadius: "50%", border: "none", cursor: disabled ? "not-allowed" : "pointer",
        background: listening ? "#e53e3e" : "var(--marigold,#e0922f)",
        color: "#fff", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: listening ? "0 0 0 6px rgba(229,62,62,.25)" : "0 4px 14px rgba(224,146,47,.35)",
        transition: "all .2s", flexShrink: 0,
      }}>
      {listening ? "■" : "🎤"}
    </button>
  );
}

// ── Waveform animation while listening ──────────────────────────────────────
function Waveform() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 28, margin: "8px auto" }}>
      {[0.6,1,0.7,1.2,0.5,0.9,1.1,0.6,0.8,1].map((h, i) => (
        <span key={i} style={{
          display: "inline-block", width: 4, borderRadius: 2,
          background: "var(--marigold,#e0922f)",
          animation: `wave ${0.6 + h * 0.3}s ease-in-out infinite alternate`,
          animationDelay: `${i * 0.07}s`,
          height: `${h * 18}px`,
        }} />
      ))}
      <style>{`@keyframes wave { from{opacity:.4;transform:scaleY(.5)} to{opacity:1;transform:scaleY(1)} }`}</style>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Interview() {
  const [stage, setStage]       = useState("setup");
  const [role, setRole]         = useState("");
  const [company, setCompany]   = useState("");
  const [context, setContext]   = useState("");
  const [voiceMode, setVoiceMode] = useState(SPEECH_OK); // default on if supported

  const [roundIdx, setRoundIdx] = useState(0);
  const [qNum, setQNum]         = useState(0);
  const [question, setQuestion] = useState("");
  const [feedback, setFeedback] = useState("");
  
  // New interviewer metadata state
  const [interviewerName, setInterviewerName] = useState("");
  const [interviewerTitle, setInterviewerTitle] = useState("");
  const [tips, setTips] = useState([]);

  const [answer, setAnswer]     = useState("");
  const [history, setHistory]   = useState([]);
  const [transcript, setTranscript] = useState([]);
  const [score, setScore]       = useState(null);

  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");
  const [speaking, setSpeaking] = useState(false); // AI speaking
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");

  const finalAnswerRef = useRef(""); // accumulates final speech

  // Silence detection state
  const [countdown, setCountdown] = useState(null);
  const silenceTimer = useRef(null);
  const intervalTimer = useRef(null);
  const submitRef = useRef();

  // Speak a question aloud then start mic
  const speakQuestion = useCallback((text, feedbackText) => {
    if (!voiceMode) return;
    setSpeaking(true);
    const utteranceText = feedbackText ? `${feedbackText} Next question: ${text}` : text;
    speak(utteranceText, () => {
      setSpeaking(false);
      if (voiceMode) startListening();
    });
  }, [voiceMode]);

  // Speech rec callbacks
  const onResult = useCallback((t) => setInterimText(t), []);
  const onSpeechEnd = useCallback(() => {
    const final = interimText.trim();
    if (final) { finalAnswerRef.current = final; setAnswer(final); }
    setInterimText("");
    setListening(false);
  }, [interimText]);

  const { start: startRec, stop: stopRec } = useSpeechRec({ onResult, onEnd: onSpeechEnd });

  const startListening = useCallback(() => {
    finalAnswerRef.current = "";
    setInterimText(""); setAnswer("");
    setListening(true);
    startRec();
  }, [startRec]);

  const stopListening = useCallback(() => {
    stopRec();
    setListening(false);
    const final = finalAnswerRef.current || interimText;
    if (final) setAnswer(final.trim());
    setInterimText("");
  }, [stopRec, interimText]);

  const toggleMic = () => listening ? stopListening() : startListening();

  // ── API helpers ──────────────────────────────────────────────────────────
  const start = async () => {
    setErr(""); setBusy(true);
    try {
      const r = await apiCall({ action: "question", role, company, context, round: ROUNDS[0], history: [] });
      setQuestion(r.question); 
      setInterviewerName(r.interviewer_name || "");
      setInterviewerTitle(r.interviewer_title || "");
      setTips(r.tips || []);
      setRoundIdx(0); setQNum(0);
      setHistory([]); setTranscript([]); setFeedback(""); setAnswer("");
      setStage("round");
      if (voiceMode) speakQuestion(r.question, "");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const submit = async () => {
    const ans = (answer || interimText).trim();
    if (!ans) return;
    if (listening) stopListening();
    window.speechSynthesis?.cancel();
    setCountdown(null);
    clearTimeout(silenceTimer.current);
    clearInterval(intervalTimer.current);

    setErr(""); setBusy(true);
    const round = ROUNDS[roundIdx];
    const newHist = [...history, { q: question, a: ans }];
    const newTrans = [...transcript, { round, q: question, a: ans }];
    const answered = qNum + 1;
    try {
      if (answered >= PER_ROUND && roundIdx >= ROUNDS.length - 1) {
        const sc = await apiCall({ action: "score", role, company, transcript: newTrans });
        setScore(sc); setStage("done");
        if (voiceMode) speak(sc.verdict || "Interview complete. Here is your scorecard.", () => {});
      } else if (answered >= PER_ROUND) {
        const fb = await apiCall({ action: "question", role, company, context, round, history: newHist });
        const next = ROUNDS[roundIdx + 1];
        const r = await apiCall({ action: "question", role, company, context, round: next, history: [] });
        setFeedback(fb.feedback || "");
        setRoundIdx(roundIdx + 1); setQNum(0); setHistory([]);
        setTranscript(newTrans); 
        setQuestion(r.question); 
        setInterviewerName(r.interviewer_name || "");
        setInterviewerTitle(r.interviewer_title || "");
        setTips(r.tips || []);
        setAnswer("");
        if (voiceMode) speakQuestion(r.question, fb.feedback);
      } else {
        const r = await apiCall({ action: "question", role, company, context, round, history: newHist });
        setFeedback(r.feedback || ""); 
        setHistory(newHist); setTranscript(newTrans);
        setQNum(answered); 
        setQuestion(r.question); 
        setInterviewerName(r.interviewer_name || "");
        setInterviewerTitle(r.interviewer_title || "");
        setTips(r.tips || []);
        setAnswer("");
        if (voiceMode) speakQuestion(r.question, r.feedback);
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  submitRef.current = submit;

  // Silence detection hook
  useEffect(() => {
    if (listening && interimText.trim()) {
      setCountdown(3);
      clearTimeout(silenceTimer.current);
      clearInterval(intervalTimer.current);

      intervalTimer.current = setInterval(() => {
        setCountdown(c => (c > 1 ? c - 1 : null));
      }, 1000);

      silenceTimer.current = setTimeout(() => {
         clearInterval(intervalTimer.current);
         submitRef.current(); // auto-submit
      }, 3000);
    } else {
      setCountdown(null);
      clearTimeout(silenceTimer.current);
      clearInterval(intervalTimer.current);
    }
    return () => {
      clearTimeout(silenceTimer.current);
      clearInterval(intervalTimer.current);
    }
  }, [interimText, listening]);

  const reset = () => {
    window.speechSynthesis?.cancel();
    stopRec();
    setStage("setup"); setScore(null); setAnswer("");
    setFeedback(""); setListening(false); setSpeaking(false);
    setCountdown(null);
    clearTimeout(silenceTimer.current);
    clearInterval(intervalTimer.current);
  };

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if (stage === "setup") return (
    <div className="screen">
      <div className="eyebrow">Interview simulator</div>
      <h1 className="title">Run a real hiring loop</h1>
      <p className="sub">HR → Technical → Hiring Manager, with live AI feedback.
        {SPEECH_OK ? " Voice mode available — the interviewer speaks, you speak back." : " Type your answers (voice needs Chrome)."}</p>
      
      <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 24 }}>
        {ROUNDS.map((r, i) => (
          <div key={r} style={{ flex: 1, background: "var(--surface-2, #F8F9FA)", border: "1px solid var(--line, #E5E7EB)", padding: "12px 8px", borderRadius: 8, fontSize: 13, fontWeight: 500, textAlign: "center", color: "var(--ink, #111827)" }}>
            <div style={{ color: "var(--ink-faint)", fontSize: 11, marginBottom: 4, textTransform: "uppercase" }}>Round {i+1}</div>
            {r}
          </div>
        ))}
      </div>

      {err && <div className="err">{err}</div>}

      {SPEECH_OK && (
        <label style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 16px",
          cursor: "pointer", fontSize: 15, background: voiceMode ? "rgba(245,158,11,0.1)" : "var(--surface-2)", padding: 16, borderRadius: 12, border: voiceMode ? "1px solid var(--marigold)" : "1px solid transparent", transition: "all 0.2s" }}>
          <input type="checkbox" checked={voiceMode} onChange={e => setVoiceMode(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "var(--marigold)" }} />
          <div>
            <div style={{ fontWeight: 600 }}>Voice Mode</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Interviewer speaks, auto-submits on silence</div>
          </div>
        </label>
      )}

      <div className="eyebrow" style={{ marginTop: 14 }}>Target role *</div>
      <input className="field" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. AI Engineer" />

      <div className="eyebrow" style={{ marginTop: 12 }}>Company (optional)</div>
      <input className="field" value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Google, Razorpay" />

      <div className="eyebrow" style={{ marginTop: 12 }}>Paste a job description or company blurb (optional)</div>
      <textarea className="field" rows={4} value={context} onChange={e => setContext(e.target.value)}
        placeholder="Paste the JD or anything about the company to tailor the questions…" />

      <button className="primary" style={{ marginTop: 16 }} onClick={start}
        disabled={busy || !role.trim()}>
        {busy ? "Setting up…" : "Start interview →"}
      </button>
    </div>
  );

  // ── SCORECARD ─────────────────────────────────────────────────────────────
  if (stage === "done" && score) {
    const getScoreColor = (sc) => sc >= 80 ? "#22C55E" : sc >= 60 ? "#F59E0B" : "#EF4444";
    const color = getScoreColor(score.overall);
    
    return (
      <div className="screen" style={{ textAlign: "center" }}>
        <div className="eyebrow">Scorecard</div>
        
        <div style={{ width: 100, height: 100, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: "bold", margin: "24px auto" }}>
          {score.overall}
        </div>
        
        <h1 className="title" style={{ fontSize: 24 }}>{score.overall >= 80 ? "Great job!" : "Keep practicing"}</h1>
        <p className="sub" style={{ fontSize: 16, maxWidth: 400, margin: "0 auto 24px" }}>{score.verdict}</p>
        
        <div style={{ textAlign: "left", maxWidth: 480, margin: "0 auto" }}>
          {score.strengths?.length > 0 && (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", padding: 16, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ color: "#166534", fontWeight: 600, marginBottom: 12 }}>What worked</div>
              {score.strengths.map((s,i) => <div key={i} style={{ color: "#15803D", fontSize: 14, marginBottom: 8, display: "flex", gap: 8 }}><span>✓</span> <span>{s}</span></div>)}
            </div>
          )}
          {score.improvements?.length > 0 && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", padding: 16, borderRadius: 12 }}>
              <div style={{ color: "#991B1B", fontWeight: 600, marginBottom: 12 }}>Fix before the real thing</div>
              {score.improvements.map((s,i) => <div key={i} style={{ color: "#B91C1C", fontSize: 14, marginBottom: 8, display: "flex", gap: 8 }}><span>→</span> <span>{s}</span></div>)}
            </div>
          )}
        </div>
        
        <button className="primary" style={{ marginTop: 32, maxWidth: 480 }} onClick={reset}>Run another →</button>
      </div>
    );
  }

  // ── IN ROUND ──────────────────────────────────────────────────────────────
  const currentAnswer = answer || interimText;
  const isLastQ = qNum + 1 >= PER_ROUND && roundIdx >= ROUNDS.length - 1;

  return (
    <div className="screen">
      <div className="eyebrow" style={{ textAlign: "center", marginBottom: 24 }}>
        Round {roundIdx+1}/{ROUNDS.length} · {ROUNDS[roundIdx]} · Q{qNum+1}/{PER_ROUND}
      </div>
      {err && <div className="err">{err}</div>}

      {/* Dark Interviewer Card */}
      <article style={{ background: "#0F172A", color: "#fff", padding: "24px", borderRadius: 16, boxShadow: "0 10px 25px rgba(15,23,42,0.15)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--marigold, #F59E0B)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 20 }}>
            {interviewerName ? interviewerName.charAt(0).toUpperCase() : "I"}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{interviewerName || "Interviewer"}</div>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>{interviewerTitle || "Recruiter"}</div>
          </div>
          {speaking && (
            <div style={{ marginLeft: "auto", display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#94A3B8", letterSpacing:".05em", textTransform: "uppercase" }}>
              <span style={{ animation:"pulse 1.2s ease infinite" }}>🔊</span> Speaking
              <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
            </div>
          )}
        </div>
        
        {feedback && (
          <blockquote style={{ borderLeft: "3px solid var(--marigold)", paddingLeft: 14, fontStyle: "italic", color: "#CBD5E1", marginBottom: 20, fontSize: 15, lineHeight: 1.5 }}>
            {feedback}
          </blockquote>
        )}
        
        <p style={{ fontSize: 19, lineHeight: 1.5, margin: 0, fontWeight: 500 }}>{question}</p>
      </article>

      {/* Tips Panel */}
      {tips && tips.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          {tips.map((t, i) => (
            <div key={i} style={{ flex: 1, background: "var(--marigold-light, #FEF9EC)", border: "1px solid rgba(245,158,11,0.2)", padding: 12, borderRadius: 8, fontSize: 13, color: "var(--marigold-dark, #D97706)", lineHeight: 1.4 }}>
              <span style={{ fontWeight: "bold", marginRight: 6 }}>{i+1}.</span>{t}
            </div>
          ))}
        </div>
      )}

      {/* Voice mode UI */}
      {voiceMode ? (
        <div style={{ marginTop: 32, display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
          {listening && <Waveform />}
          
          <div style={{ display:"flex", alignItems:"center", gap: 16 }}>
            <MicBtn listening={listening} onClick={toggleMic} disabled={busy || speaking} />
            
            {listening && !currentAnswer && (
              <span style={{ fontSize:14, color:"var(--ink-soft)" }}>Listening…</span>
            )}
            
            {countdown !== null && (
              <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid var(--marigold)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--marigold)", fontWeight: "bold", fontSize: 18, animation: "pop 0.3s ease-out" }}>
                {countdown}
                <style>{`@keyframes pop{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
              </div>
            )}
          </div>
          
          {currentAnswer && (
            <div style={{ width:"100%", background:"var(--surface-2,#fff)",
              border:"1px solid var(--line,#e7e1d5)", borderRadius:12, padding:"16px",
              fontSize:15, color:"var(--ink,#1c1a17)", lineHeight:1.6, marginTop: 8 }}>
              <div style={{ fontSize:11, color:"var(--ink-faint,#8a8378)", textTransform:"uppercase",
                letterSpacing:".08em", marginBottom: 6 }}>Your answer</div>
              <p style={{ margin:0 }}>{currentAnswer}</p>
            </div>
          )}
          
          {currentAnswer && !listening && countdown === null && (
            <button className="primary" style={{ width:"100%", marginTop: 8 }} onClick={submit} disabled={busy}>
              {busy ? "Thinking…" : isLastQ ? "Finish & get scorecard →" : "Submit answer →"}
            </button>
          )}
          
          <button onClick={reset} style={{ background:"none", border:"none", fontSize:13,
            color:"var(--ink-faint,#8a8378)", cursor:"pointer", marginTop: 8, padding: 8 }}>
            ✕ End interview
          </button>
        </div>
      ) : (
        /* Text fallback */
        <div style={{ marginTop: 24 }}>
          <textarea className="field" rows={6} value={answer} 
            onChange={e => setAnswer(e.target.value)} placeholder="Type your answer here…" />
          
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button className="primary" style={{ flex: 1 }} onClick={submit}
              disabled={busy || !answer.trim()}>
              {busy ? "Thinking…" : isLastQ ? "Finish & get scorecard →" : "Submit answer →"}
            </button>
            <button onClick={reset} style={{ background:"var(--surface-2)", color: "var(--ink)", border:"none", borderRadius: 8, padding: "0 16px", fontSize:14, fontWeight: 500, cursor:"pointer" }}>
              End
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
