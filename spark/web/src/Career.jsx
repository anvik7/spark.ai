import React, { useState, useEffect, useRef } from "react";
import GoalSetting from "./GoalSetting";
import { api } from "./api";

const pct = (n) => `${Math.round(n * 100)}%`;
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
  const [analysis, setAnalysis] = useState(null);

  // Cover Letter state
  const [clBusy, setClBusy] = useState(false);
  const [clErr, setClErr] = useState("");
  const [clLetter, setClLetter] = useState("");
  const [copied, setCopied] = useState(false);

  // User Goal state
  const [existingGoal, setExistingGoal] = useState(null);

  const fileInputRef = useRef();

  useEffect(() => {
    // 1. Fetch user goal
    api.getGoal()
      .then(setExistingGoal)
      .catch(() => setExistingGoal(null));

    // 2. Fetch user career profile & previous analysis
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

  const handleSaveGoal = async (goalData) => {
    const saved = await api.setGoal(goalData);
    setExistingGoal(saved);
    return saved;
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const res = await api.uploadResume(file, targetRole, jobDescription);
      if (res.resume_filename) setResumeFilename(res.resume_filename);
      if (res.resume_text) setResumeText(res.resume_text);
      if (res.analysis) setAnalysis(res.analysis);
    } catch (e) {
      setErr(e.message || "Failed to parse resume file.");
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
      <div style={{ marginBottom: 20 }}>
        <GoalSetting currentGoal={existingGoal} onSave={handleSaveGoal} />
      </div>

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
          {resumeFilename && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "#059669", background: "#ECFDF5", padding: "3px 10px", borderRadius: 12, border: "1px solid #A7F3D0" }}>
              📄 {resumeFilename}
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "var(--surface-2)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink)",
              cursor: "pointer",
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

      {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

      <button
        className="btn full"
        onClick={runAnalysis}
        disabled={busy || (!resumeText.trim() && !resumeFilename)}
        style={{
          padding: "12px 24px",
          fontSize: 15,
          fontWeight: 700,
          borderRadius: "var(--r-s)",
          background: busy ? "var(--line)" : "var(--p-gradient)",
          color: "#fff",
          cursor: busy ? "not-allowed" : "pointer",
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
              boxShadow: "var(--sh)",
              display: "flex",
              alignItems: "center",
              gap: 20,
            }}
          >
            <Ring score={analysis.readiness || 0} />
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ margin: 0, color: "var(--marigold-dark)" }}>Calculated Readiness Score</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "2px 0 6px", color: "var(--ink)" }}>
                {analysis.readiness >= 75 ? "High Market Alignment 🎉" : analysis.readiness >= 50 ? "Moderate Alignment — Action Required" : "High Skill Gap Detected"}
              </h2>
              <p className="sub" style={{ margin: 0, fontSize: 13.5, color: "var(--ink-soft)" }}>
                {analysis.note || "Calculated using your actual resume content against target market requirements."}
              </p>
              {analysis.demand_source && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-faint)", fontFamily: "var(--mono)" }}>
                  Source: {analysis.demand_source}
                </div>
              )}
            </div>
          </div>

          {/* Job Description Match Analysis */}
          {analysis.jd_match && (
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>🎯 Job Description Keyword Match</h3>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB", background: "#EFF6FF", padding: "4px 12px", borderRadius: 12, border: "1px solid #BFDBFE" }}>
                  {analysis.jd_match.match_score || analysis.readiness}% Match
                </span>
              </div>

              {analysis.jd_match.matching_keywords?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#059669", display: "block", marginBottom: 4 }}>
                    ✓ Matching Qualifications
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {analysis.jd_match.matching_keywords.map((kw, i) => (
                      <span key={i} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {analysis.jd_match.missing_keywords?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#DC2626", display: "block", marginBottom: 4 }}>
                    ⚠ Missing Key Qualifications from JD
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {analysis.jd_match.missing_keywords.map((kw, i) => (
                      <span key={i} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FCA5A5" }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {analysis.jd_match.recommendations?.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>
                    Tailoring Advice
                  </span>
                  {analysis.jd_match.recommendations.map((rec, i) => (
                    <div key={i} style={{ fontSize: 13, color: "var(--ink)", margin: "3px 0" }}>
                      • {rec}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Detected Strengths */}
          {analysis.strengths?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="eyebrow" style={{ color: "var(--ok)", marginBottom: 8 }}>Detected Candidate Strengths</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {analysis.strengths.map((s) => (
                  <div key={s.skill} style={{ background: "var(--surface)", border: "1px solid var(--line)", padding: "10px 14px", borderRadius: 10 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{s.skill}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>Proficiency: {pct(s.proficiency)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skill Gaps */}
          {analysis.gaps?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="eyebrow" style={{ color: "var(--marigold-dark)", marginBottom: 8 }}>Highest-Leverage Skill Gaps</div>
              {analysis.gaps.map((g) => (
                <div key={g.skill} style={{ marginBottom: 10, background: "var(--surface)", border: "1px solid var(--line)", padding: 12, borderRadius: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                    <span>{g.skill}</span>
                    <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--ink-faint)" }}>
                      Demand {pct(g.demand)} · You {pct(g.proficiency)}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: pct(g.demand), background: "var(--line)" }}>
                      <div style={{ height: "100%", width: pct(g.proficiency / (g.demand || 1)), background: "var(--marigold)" }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ATS Resume Audit */}
          {analysis.resume_audit && (
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
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px", color: "var(--ink)" }}>📝 ATS & Recruiter Resume Audit</h3>
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 12px", lineHeight: 1.5 }}>
                {analysis.resume_audit.summary}
              </p>

              {analysis.resume_audit.strengths?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#059669", display: "block", marginBottom: 4 }}>
                    Resume Strengths
                  </span>
                  {analysis.resume_audit.strengths.map((str, i) => (
                    <div key={i} style={{ fontSize: 13, color: "var(--ink)", margin: "2px 0" }}>• {str}</div>
                  ))}
                </div>
              )}

              {analysis.resume_audit.weaknesses?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#D97706", display: "block", marginBottom: 4 }}>
                    Areas to Improve
                  </span>
                  {analysis.resume_audit.weaknesses.map((w, i) => (
                    <div key={i} style={{ fontSize: 13, color: "var(--ink)", margin: "2px 0" }}>• {w}</div>
                  ))}
                </div>
              )}

              {analysis.resume_audit.ats_issues?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#DC2626", display: "block", marginBottom: 4 }}>
                    ATS Flags
                  </span>
                  {analysis.resume_audit.ats_issues.map((ats, i) => (
                    <div key={i} style={{ fontSize: 13, color: "#DC2626", margin: "2px 0" }}>⚠ {ats}</div>
                  ))}
                </div>
              )}

              {analysis.resume_audit.fixes?.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#059669", display: "block", marginBottom: 4 }}>
                    Suggested Rewrite Fixes
                  </span>
                  {analysis.resume_audit.fixes.map((fix, i) => (
                    <div key={i} style={{ fontSize: 13, color: "var(--ink)", margin: "3px 0" }}>✓ {fix}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actionable Learning Plan */}
          {analysis.plan?.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ color: "var(--marigold-dark)", marginBottom: 8 }}>Personalized 3-Hour Learning Plan</div>
              {analysis.plan.map((p, i) => (
                <article className="card kind-link" key={i} style={{ marginBottom: 10 }}>
                  <p className="summary" style={{ fontSize: 15, fontWeight: 700 }}>{p.skill}</p>
                  <p className="raw" style={{ fontSize: 13, color: "var(--ink-soft)", margin: "4px 0" }}>{p.why}</p>
                  <p style={{ fontSize: 13.5, margin: "6px 0", color: "var(--ink)" }}><b>Path:</b> {p.plan}</p>
                  <p style={{ fontSize: 13, margin: 0, color: "var(--marigold-dark)" }}><b>Project Idea:</b> {p.project}</p>
                </article>
              ))}
            </div>
          )}

          {/* Tailored Cover Letter Generator */}
          <div style={{ marginTop: 26, borderTop: "1px solid var(--line)", paddingTop: 20 }}>
            <div className="eyebrow" style={{ color: "var(--marigold-dark)", marginBottom: 6 }}>Tailored Cover Letter</div>
            <p className="sub" style={{ margin: "0 0 14px", fontSize: 13.5 }}>
              Generate a tailored cover letter using your actual resume context for {targetRole || "target position"}.
            </p>

            {clErr && <div className="err" style={{ marginBottom: 10 }}>{clErr}</div>}

            <button
              className="btn full"
              onClick={draftCoverLetter}
              disabled={clBusy}
              style={{
                padding: "10px 18px",
                borderRadius: "var(--r-s)",
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: clLetter ? 16 : 0,
              }}
            >
              {clBusy ? "Drafting Cover Letter with AI…" : "✍ Draft Tailored Cover Letter"}
            </button>

            {clLetter && (
              <div
                style={{
                  position: "relative",
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--r)",
                  padding: "16px 18px",
                  marginTop: 12,
                }}
              >
                <button
                  onClick={copyLetter}
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 12,
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 8,
                    border: `1px solid ${copied ? "#059669" : "var(--line)"}`,
                    background: copied ? "#ECFDF5" : "var(--surface)",
                    color: copied ? "#059669" : "var(--ink-soft)",
                    cursor: "pointer",
                  }}
                >
                  {copied ? "✓ Copied" : "Copy Letter"}
                </button>
                <pre
                  style={{
                    fontFamily: "var(--sans)",
                    fontSize: 13.5,
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                    paddingRight: 48,
                    color: "var(--ink)",
                  }}
                >
                  {clLetter}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
