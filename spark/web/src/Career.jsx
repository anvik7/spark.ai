import React, { useState, useEffect, useRef } from "react";
import { api } from "./api";

const scoreColor = (s) =>
  s >= 75 ? "#10B981" : s >= 50 ? "var(--marigold)" : "#EF4444";

function Ring({ score }) {
  const r = 46,
    c = 2 * Math.PI * r,
    off = c * (1 - Math.min(100, Math.max(0, score)) / 100);
  return (
    <svg viewBox="0 0 110 110" style={{ width: 120, height: 120 }}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
      <circle
        cx="55"
        cy="55"
        r={r}
        fill="none"
        stroke={scoreColor(score)}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 55 55)"
        style={{ transition: "stroke-dashoffset .8s ease" }}
      />
      <text
        x="55"
        y="52"
        textAnchor="middle"
        fontFamily="var(--display)"
        fontSize="26"
        fontWeight="600"
        fill="var(--ink)"
      >
        {score}
      </text>
      <text
        x="55"
        y="70"
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize="9"
        fill="var(--ink-faint)"
      >
        / 100
      </text>
    </svg>
  );
}

export default function Career({ onNavigate, user }) {
  const [targetRole, setTargetRole] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFilename, setResumeFilename] = useState("");
  const [github, setGithub] = useState("");

  const [busy, setBusy] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [analysis, setAnalysis] = useState(null);

  // Cover Letter state
  const [clBusy, setClBusy] = useState(false);
  const [clErr, setClErr] = useState("");
  const [clLetter, setClLetter] = useState("");
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef();

  useEffect(() => {
    // Fetch user career profile & previous analysis
    setLoadingProfile(true);
    api.getCareerProfile()
      .then((prof) => {
        if (prof) {
          if (prof.target_role) setTargetRole(prof.target_role);
          if (prof.target_company) setTargetCompany(prof.target_company);
          if (prof.job_description) setJobDescription(prof.job_description);
          if (prof.resume_text) setResumeText(prof.resume_text);
          if (prof.resume_filename) setResumeFilename(prof.resume_filename);
          if (prof.github_username) setGithub(prof.github_username);
          if (prof.last_analysis) setAnalysis(prof.last_analysis);
        }
      })
      .catch((e) => console.error("Failed to load career profile:", e))
      .finally(() => setLoadingProfile(false));
  }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    setSuccessMsg("");
    try {
      const res = await api.uploadResume(file, targetRole, jobDescription);
      if (res.resume_filename) setResumeFilename(res.resume_filename);
      if (res.resume_text) setResumeText(res.resume_text);
      if (res.analysis) setAnalysis(res.analysis);
      setSuccessMsg(`Uploaded and parsed "${file.filename || file.name}".`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (e) {
      setErr(e.message || "Failed to parse resume file.");
    } finally {
      setBusy(false);
    }
  };

  const handleClearResume = async () => {
    if (!resumeFilename && !resumeText.trim()) return;
    setBusy(true);
    setErr("");
    setSuccessMsg("");
    try {
      await api.clearResume();
      setResumeFilename("");
      setResumeText("");
      setAnalysis(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSuccessMsg("Resume removed from profile.");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (e) {
      setErr(e.message || "Failed to remove resume.");
    } finally {
      setBusy(false);
    }
  };

  const runAnalysis = async () => {
    if (!resumeText.trim() && !resumeFilename) {
      setErr("Please paste your resume text or upload a PDF/Doc resume.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await api.auditCareer({
        target_role: targetRole,
        target_company: targetCompany,
        job_description: jobDescription,
        resume_text: resumeText,
        github_username: github,
      });
      setAnalysis(res);
    } catch (e) {
      setErr(e.message || "Failed to analyze resume.");
    } finally {
      setBusy(false);
    }
  };

  const draftCoverLetter = async () => {
    setClErr("");
    setClBusy(true);
    setClLetter("");
    try {
      const strengthsList = (analysis?.strengths || []).map((s) => s.skill);
      const res = await api.draftCoverLetter({
        role: targetRole || "Target Position",
        company: targetCompany || "Hiring Company",
        strengths: strengthsList,
        resume_text: resumeText,
      });
      setClLetter(res.letter);
    } catch (e) {
      setClErr(e.message || "Failed to draft cover letter.");
    } finally {
      setClBusy(false);
    }
  };

  const copyLetter = () => {
    navigator.clipboard.writeText(clLetter).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="screen">
      <div className="eyebrow" style={{ color: "var(--marigold-dark)" }}>AI Career Intelligence Engine</div>
      <h1 className="title" style={{ fontSize: 26, margin: 0 }}>Career & Resume OS</h1>
      <p className="sub" style={{ margin: "4px 0 20px", fontSize: 14 }}>
        Upload your PDF resume or paste your text. Spark AI scores your readiness against target roles, analyzes ATS compatibility, and tells you the exact next steps to land your dream job.
      </p>

      {/* Target Role & Job Context Section */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: 18,
          marginBottom: 20,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "var(--ink)" }}>1. Target Role & Opportunity</h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div className="field">
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Target Role / Title *</label>
            <input
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. AI Engineer, Full Stack Developer, Product Manager"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 14 }}
            />
          </div>

          <div className="field">
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Target Company (Optional)</label>
            <input
              value={targetCompany}
              onChange={(e) => setTargetCompany(e.target.value)}
              placeholder="e.g. Google, Razorpay, Microsoft"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 14 }}
            />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>Target Job Description (JD) (Optional — paste for exact match analysis)</label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={3}
            placeholder="Paste job posting description, key qualifications, or required skills..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13.5, resize: "vertical", fontFamily: "var(--sans)" }}
          />
        </div>

        <div className="field">
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>GitHub Username (Optional)</label>
          <input
            value={github}
            onChange={(e) => setGithub(e.target.value)}
            placeholder="e.g. torvalds"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13 }}
          />
        </div>
      </div>

      {/* Resume Input Section */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: 18,
          marginBottom: 20,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>2. Resume & Qualifications</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {resumeFilename && (
              <span style={{ fontSize: 12, fontWeight: 600, color: "#059669", background: "#ECFDF5", padding: "3px 10px", borderRadius: 12, border: "1px solid #A7F3D0" }}>
                📄 {resumeFilename}
              </span>
            )}
            {(resumeFilename || resumeText.trim()) && (
              <button
                type="button"
                onClick={handleClearResume}
                disabled={busy}
                style={{
                  padding: "3px 10px",
                  borderRadius: 12,
                  border: "1px solid #FECACA",
                  background: "#FEF2F2",
                  color: "#DC2626",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>🗑️ Remove Resume</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink)",
              cursor: busy ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>📁 Upload PDF / DOCX Resume</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            style={{ display: "none" }}
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
          />
          <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>or paste resume text below</span>
        </div>

        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          rows={6}
          placeholder="Paste your resume text here (education, technical skills, projects, employment history, certifications)..."
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "var(--surface)",
            fontSize: 13.5,
            lineHeight: 1.6,
            fontFamily: "var(--sans)",
            resize: "vertical",
            color: "var(--ink)",
          }}
        />
      </div>

      {err && <div className="err" style={{ marginBottom: 16 }}>⚠️ {err}</div>}
      {successMsg && (
        <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#059669", padding: "10px 14px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>
          ✅ {successMsg}
        </div>
      )}

      <button
        className="btn full"
        onClick={runAnalysis}
        disabled={busy || (!resumeText.trim() && !resumeFilename)}
        style={{
          padding: "12px 24px",
          fontSize: 15,
          fontWeight: 700,
          borderRadius: "var(--r-s)",
          background: busy || (!resumeText.trim() && !resumeFilename) ? "var(--line)" : "var(--p-gradient)",
          color: "#fff",
          cursor: busy || (!resumeText.trim() && !resumeFilename) ? "not-allowed" : "pointer",
          boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
          marginBottom: 24,
        }}
      >
        {busy ? "Analyzing Resume & Job Match with AI…" : "Analyze Career Readiness →"}
      </button>

      {loadingProfile && (
        <div style={{ padding: 30, textAlign: "center", color: "var(--ink-soft)" }}>
          <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading your career profile…
        </div>
      )}

      {/* AI Career Analysis Results Dashboard */}
      {analysis && !loadingProfile && (
        <div style={{ marginTop: 24 }}>
          {/* Readiness Score Header */}
          <div
            style={{
              background: "var(--surface)",
              border: "1.5px solid var(--line)",
              borderRadius: "var(--r-l)",
              padding: 20,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 24,
            }}
          >
            <Ring score={analysis.overall_score || 0} />
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ color: "var(--marigold-dark)" }}>AI Target Match Assessment</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "2px 0 6px", color: "var(--ink)" }}>
                {analysis.role_title || targetRole || "Career Role"} Analysis
              </h2>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                {analysis.summary || "Complete technical readiness evaluation based on your resume and target company requirements."}
              </p>
            </div>
          </div>

          {/* Strengths & Missing Skills */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            {/* Strengths */}
            <div className="card" style={{ padding: 18, marginBottom: 0 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", color: "#059669" }}>
                ✅ Verified Strengths ({analysis.strengths?.length || 0})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(analysis.strengths || []).map((st, idx) => (
                  <div key={idx} style={{ background: "#F0FDF4", border: "1px solid #DCFCE7", padding: "8px 12px", borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>{st.skill}</div>
                    <div style={{ fontSize: 12, color: "#15803D", marginTop: 2 }}>{st.evidence}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gaps / Missing Skills */}
            <div className="card" style={{ padding: 18, marginBottom: 0 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", color: "#D97706" }}>
                ⚠️ Missing Skills & Requirements ({analysis.gaps?.length || 0})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(analysis.gaps || []).map((gap, idx) => (
                  <div key={idx} style={{ background: "#FFFBEB", border: "1px solid #FDE68A", padding: "8px 12px", borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>{gap.skill}</div>
                    <div style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>{gap.recommendation}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Plan */}
          {analysis.action_plan && (
            <div className="card" style={{ padding: 18, marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", color: "var(--ink)" }}>
                🚀 AI Recommended Career Action Plan
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(analysis.action_plan || []).map((act, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 800, color: "var(--marigold-dark)", background: "var(--surface-2)", width: 22, height: 22, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>
                      {idx + 1}
                    </span>
                    <span>{act}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cover Letter Generator Section */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
                ✉️ AI Tailored Cover Letter Generator
              </h3>
              <button
                type="button"
                onClick={draftCoverLetter}
                disabled={clBusy}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: clBusy ? "var(--line)" : "var(--p-gradient)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: clBusy ? "not-allowed" : "pointer",
                }}
              >
                {clBusy ? "Drafting Cover Letter…" : "Generate Cover Letter →"}
              </button>
            </div>

            {clErr && <div className="err" style={{ marginBottom: 12 }}>{clErr}</div>}

            {clLetter && (
              <div>
                <textarea
                  readOnly
                  value={clLetter}
                  rows={10}
                  style={{
                    width: "100%",
                    padding: 14,
                    borderRadius: 8,
                    border: "1px solid var(--line)",
                    background: "var(--surface-2)",
                    fontSize: 13,
                    lineHeight: 1.6,
                    fontFamily: "var(--sans)",
                    marginBottom: 10,
                  }}
                />
                <button
                  type="button"
                  onClick={copyLetter}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    background: "var(--surface-2)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {copied ? "✓ Copied to Clipboard!" : "📋 Copy Cover Letter"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
