import React, { useState } from "react";
import { api } from "./api.js";

export default function Practice() {
  const [prompt, setPrompt] = useState("");
  const [subjectHint, setSubjectHint] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [solution, setSolution] = useState(null);
  const [err, setErr] = useState("");
  const [activeMode, setActiveMode] = useState("solver"); // "solver" | "quiz"

  const handleSolve = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() && !selectedFile) {
      setErr("Please type a question prompt or attach a problem image/document.");
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
      <div style={{ marginBottom: 20 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--ink)" }}>Practice & Question Solver</h1>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Solve academic problems step-by-step, practice custom question sets, and simulate exam sessions.
        </p>
      </div>

      {/* Assessment Mode Selector Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <div
          onClick={() => { setPrompt("Solve 5 practice problems on Linear Algebra with step-by-step reasoning."); setSubjectHint("Mathematics"); }}
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1.5px solid var(--line)",
            background: "var(--surface)",
            cursor: "pointer",
            boxShadow: "var(--sh-sm)",
          }}
        >
          <div style={{ fontSize: 20, marginBottom: 6 }}>🛡️</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Quick Practice</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>5-10 Focused Questions</div>
        </div>

        <div
          onClick={() => { setPrompt("Generate a 15-minute timed test on Mechanics and Laws of Motion."); setSubjectHint("Physics"); }}
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1.5px solid var(--line)",
            background: "var(--surface)",
            cursor: "pointer",
            boxShadow: "var(--sh-sm)",
          }}
        >
          <div style={{ fontSize: 20, marginBottom: 6 }}>⏱️</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Timed Test</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>Simulated Exam Environment</div>
        </div>

        <div
          onClick={() => { setPrompt("Explain common conceptual mistakes in Organic Chemistry reaction mechanisms with examples."); setSubjectHint("Chemistry"); }}
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1.5px solid var(--line)",
            background: "var(--surface)",
            cursor: "pointer",
            boxShadow: "var(--sh-sm)",
          }}
        >
          <div style={{ fontSize: 20, marginBottom: 6 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Mistake Review</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>Review Weak Areas</div>
        </div>

        <div
          onClick={() => { setPrompt("Provide 5 multiple-choice questions on Data Structures and Algorithms with explanations."); setSubjectHint("Computer Science"); }}
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1.5px solid var(--line)",
            background: "var(--surface)",
            cursor: "pointer",
            boxShadow: "var(--sh-sm)",
          }}
        >
          <div style={{ fontSize: 20, marginBottom: 6 }}>💻</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Custom Practice</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>Subject & Topic Select</div>
        </div>
      </div>

      {/* AI Question Solver Composer */}
      <form
        onSubmit={handleSolve}
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          padding: 18,
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
          placeholder="Paste a question, math equation, code problem, or concept you want to practice..."
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

      {/* Solution & Reasoning Display */}
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
