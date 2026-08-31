import React, { useState } from "react";
import { api } from "./api.js";

export default function Practice() {
  const [prompt, setPrompt] = useState("");
  const [subjectHint, setSubjectHint] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [solution, setSolution] = useState(null);
  const [err, setErr] = useState("");

  const handleSolve = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() && !selectedFile) {
      setErr("Please type a problem prompt or upload a question image/document.");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      let res;
      if (selectedFile) {
        res = await api.uploadTaskFile(selectedFile, prompt.trim(), subjectHint);
      } else {
        res = await api.solveTask(prompt.trim(), subjectHint);
      }
      setSolution(res);
    } catch (e) {
      setErr(e.message || "Failed to solve practice question.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Practice & Question Solver</h1>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Solve academic questions, practice test problems, and analyze step-by-step reasoning.
        </p>
      </div>

      {/* Quick Practice Mode Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        <button
          onClick={() => { setPrompt("Solve 5 practice questions on Quadratic Equations with detailed steps."); setSubjectHint("Mathematics"); }}
          style={{
            padding: "12px",
            borderRadius: 10,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 4 }}>🔢</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>10 Questions</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Mathematics</div>
        </button>

        <button
          onClick={() => { setPrompt("Explain Newton's laws of motion with numerical practice problems."); setSubjectHint("Physics"); }}
          style={{
            padding: "12px",
            borderRadius: 10,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 4 }}>⚡</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>20 Questions</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Physics</div>
        </button>

        <button
          onClick={() => { setPrompt("Provide a 15-minute timed test on Organic Reaction Mechanisms."); setSubjectHint("Chemistry"); }}
          style={{
            padding: "12px",
            borderRadius: 10,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 18, marginBottom: 4 }}>⏱️</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Timed Test</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>15 mins</div>
        </button>
      </div>

      {/* Problem Input Composer */}
      <form
        onSubmit={handleSolve}
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          padding: 16,
          boxShadow: "var(--sh-sm)",
          marginBottom: 20,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
          Ask or Paste Question
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Paste a question, math problem, or concept you want to practice..."
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

        {selectedFile && (
          <div style={{ padding: "8px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, color: "var(--ink)", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>📄 {selectedFile.name}</span>
            <button type="button" onClick={() => setSelectedFile(null)} style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer" }}>✕</button>
          </div>
        )}

        {err && <div className="err" style={{ marginBottom: 10, fontSize: 13 }}>⚠️ {err}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <label
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                color: "var(--ink)",
              }}
            >
              📷 Attach Diagram / Image
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={busy || (!prompt.trim() && !selectedFile)}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: busy || (!prompt.trim() && !selectedFile) ? "var(--line)" : "var(--p-gradient)",
              color: "#ffffff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: busy || (!prompt.trim() && !selectedFile) ? "not-allowed" : "pointer",
            }}
          >
            {busy ? "Solving Step-by-Step…" : "Solve Problem →"}
          </button>
        </div>
      </form>

      {/* Solution Display */}
      {solution && (
        <div
          style={{
            background: "var(--surface)",
            border: "1.5px solid var(--marigold)",
            borderRadius: 12,
            padding: 18,
            boxShadow: "var(--sh)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "2px 8px", borderRadius: 6 }}>
              Step-by-Step Solution
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Spark AI Reasoning
            </span>
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>
            {solution.title || prompt}
          </div>

          <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.6, whiteSpace: "pre-wrap", background: "var(--surface-2)", padding: 14, borderRadius: 8, border: "1px solid var(--line)" }}>
            {solution.solution || solution.answer || solution.response || "Solution ready."}
          </div>
        </div>
      )}
    </div>
  );
}
