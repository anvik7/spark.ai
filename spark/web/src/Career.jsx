import React, { useState } from "react";

// Self-contained: reads the auth token directly and calls /api/career/audit.
// Styled with the app's CSS variables so it matches without editing index.css.
async function runAudit(body) {
  const token = localStorage.getItem("spark_token") || "";
  const res = await fetch("/api/career/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Audit failed");
  return data;
}

async function runCoverLetter(body) {
  const token = localStorage.getItem("spark_token") || "";
  const res = await fetch("/api/career/cover-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Could not draft cover letter");
  return data.letter;
}

async function addToCapture(text) {
  const token = localStorage.getItem("spark_token") || "";
  const res = await fetch("/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind: "text", raw: text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Could not save");
  return data;
}

const pct = (n) => `${Math.round(n * 100)}%`;
const scoreColor = (s) =>
  s >= 70 ? "var(--ok)" : s >= 40 ? "var(--marigold)" : "var(--danger)";

function Ring({ score }) {
  const r = 46, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  return (
    <svg viewBox="0 0 110 110" style={{ width: 120, height: 120 }}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
      <circle cx="55" cy="55" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="9"
        strokelinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform="rotate(-90 55 55)" style={{ transition: "stroke-dashoffset .8s ease" }} />
      <text x="55" y="52" textAnchor="middle" fontFamily="var(--display)"
        fontSize="26" fontWeight="600" fill="var(--ink)">{score}</text>
      <text x="55" y="70" textAnchor="middle" fontFamily="var(--mono)"
        fontSize="9" fill="var(--ink-faint)">/ 100</text>
    </svg>
  );
}

// Gap row with "+ Add goal" button that saves the skill into Spark Capture
function GapRow({ g }) {
  const [saved, setSaved] = useState(false);

  const handleAddGoal = async () => {
    try {
      await addToCapture(
        `Study goal: close my gap in ${g.skill} (market demand ${pct(g.demand)}, I am at ${pct(g.proficiency)})`
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { /* silent fail - non-critical action */ }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "center", fontSize: 13.5, marginBottom: 5,
      }}>
        <strong>{g.skill}</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--mono)", color: "var(--ink-faint)", fontSize: 11 }}>
            demand {pct(g.demand)} · you {pct(g.proficiency)}
          </span>
          <button
            onClick={handleAddGoal}
            style={{
              fontSize: 10.5, padding: "3px 8px", borderRadius: 12,
              border: `1px solid ${saved ? "var(--ok)" : "var(--line)"}`,
              background: saved ? "rgba(92,127,98,.1)" : "var(--surface-2)",
              color: saved ? "var(--ok)" : "var(--ink-soft)",
              cursor: "pointer", transition: "all .15s", whiteSpace: "nowrap",
            }}
          >
            {saved ? "✓ Saved" : "+ Add goal"}
          </button>
        </div>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct(g.demand), background: "var(--line)" }}>
          <div style={{
            height: "100%",
            width: g.demand ? pct(g.proficiency / g.demand) : "0%",
            background: "var(--marigold)",
          }} />
        </div>
      </div>
    </div>
  );
}

export default function Career({ onNavigate, user }) {
  const [gh, setGh] = useState("");
  const [resume, setResume] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // --- cover letter state ---
  const [clRole,   setClRole]   = useState("");
  const [clBusy,   setClBusy]   = useState(false);
  const [clErr,    setClErr]    = useState("");
  const [clLetter, setClLetter] = useState("");
  const [copied,   setCopied]   = useState(false);

  const isPro = user?.plan === "pro" || user?.plan === "ultra";

  const analyze = async () => {
    setErr(""); setBusy(true); setData(null);
    setClLetter(""); setClErr("");
    try {
      setData(await runAudit({ github_username: gh.trim(), resume_text: resume.trim() }));
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const draftCoverLetter = async () => {
    setClErr(""); setClBusy(true); setClLetter("");
    try {
      const strengths = (data?.strengths || []).map((s) => s.skill);
      setClLetter(await runCoverLetter({
        role: clRole.trim(),
        strengths,
        resume_text: resume.trim(),
      }));
    } catch (e) { setClErr(e.message); }
    finally { setClBusy(false); }
  };

  const copyLetter = () => {
    navigator.clipboard.writeText(clLetter).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="screen">
      <div className="eyebrow">Career OS</div>
      <h1 className="title">Where do you stand?</h1>
      <p className="sub">Drop your GitHub or paste your resume. Spark scores you against
        live market demand and tells you the exact next thing to learn.</p>

      <div className="field" style={{ marginBottom: 10 }}>
        <label>GitHub username</label>
        <input value={gh} onChange={(e) => setGh(e.target.value)} placeholder="e.g. torvalds"
          onKeyDown={(e) => e.key === "Enter" && analyze()} />
      </div>
      <div className="field">
        <label>or paste resume text (optional)</label>
        <textarea value={resume} onChange={(e) => setResume(e.target.value)} rows={4}
          placeholder="Skills, projects, technologies..."
          style={{ width: "100%", padding: "12px 14px", border: "1px solid var(--line)",
            borderRadius: 11, background: "var(--surface)", fontSize: 14, resize: "vertical" }} />
      </div>
      {err && <div className="err">{err}</div>}
      <button className="btn full" onClick={analyze} disabled={busy || (!gh.trim() && !resume.trim())}>
        {busy ? <span className="spin" /> : "Analyse my readiness"}
      </button>

      {busy && !data && (
        <div style={{ marginTop: 22 }}>
          <div className="skeleton" style={{ height: 120, borderRadius: "var(--r-l)", marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 60, borderRadius: "var(--r)", marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 60, borderRadius: "var(--r)" }} />
        </div>
      )}
      {data && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Ring score={data.readiness} />
            <div>
              <div className="eyebrow" style={{ margin: 0 }}>Market readiness</div>
              <p className="sub" style={{ margin: "6px 0 0" }}>{data.note}</p>
              {data.demand_source && (
                <span className="tag" style={{ marginTop: 8, fontSize: 10.5,
                  color: data.demand_source.includes("live") ? "var(--ok)" : "var(--ink-faint)",
                  background: data.demand_source.includes("live") ? "rgba(92,127,98,.1)" : "var(--surface-2)" }}>
                  {data.demand_source.includes("live") ? "- " : "o "}demand: {data.demand_source}
                </span>
              )}
            </div>
          </div>

          {data.strengths?.length > 0 && (
            <>
              <div className="eyebrow">Your strengths</div>
              <div className="tags" style={{ marginBottom: 16 }}>
                {data.strengths.map((s) => (
                  <span className="tag" key={s.skill}
                    style={{ color: "var(--ok)", background: "rgba(92,127,98,.1)" }}>
                    {s.skill}
                  </span>
                ))}
              </div>
            </>
          )}

          <div className="eyebrow">Highest-leverage gaps</div>
          {data.gaps.map((g) => (
            <GapRow key={g.skill} g={g} />
          ))}

          {data.locked?.includes("plan") && (
            <>
              <div className="eyebrow" style={{ marginTop: 18 }}>Your learning plan</div>
              <article className="card" style={{ position: "relative", overflow: "hidden" }}>
                <div style={{ filter: "blur(5px)", userSelect: "none", pointerEvents: "none" }}>
                  <p className="summary">Close your top gap: {data.gaps?.[0]?.skill || "your weakest skill"}</p>
                  <p className="raw">Why it matters, a focused ~3-hour path, and a project to prove it.</p>
                  <p style={{ fontSize: 13.5, margin: "6px 0 0" }}>A plan tuned to every gap above</p>
                </div>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 10,
                  background: "rgba(250,248,243,0.45)" }}>
                  <p className="raw" style={{ fontWeight: 600, margin: 0 }}>Your exact next steps</p>
                  <button className="primary" onClick={() => onNavigate?.("upgrade")}>Unlock with Pro</button>
                </div>
              </article>
            </>
          )}

          {data.plan?.length > 0 && (
            <>
              <div className="eyebrow" style={{ marginTop: 18 }}>Your learning plan</div>
              {data.plan.map((p, i) => (
                <article className="card kind-link" key={i}>
                  <p className="summary">{p.skill}</p>
                  <p className="raw">{p.why}</p>
                  <p style={{ fontSize: 13.5, margin: "0 0 6px" }}>{p.plan}</p>
                  <p style={{ fontSize: 13.5, margin: 0, color: "var(--ink-soft)" }}>{p.project}</p>
                </article>
              ))}
            </>
          )}

          {data.locked?.includes("resume_audit") && (
            <>
              <div className="eyebrow" style={{ marginTop: 18 }}>Resume audit</div>
              <article className="card" style={{ position: "relative", overflow: "hidden" }}>
                <div style={{ filter: "blur(5px)", userSelect: "none", pointerEvents: "none" }}>
                  <p className="summary">An AI recruiter's read on your resume</p>
                  <p className="raw">Strengths, Weaknesses, ATS issues, and concrete rewrite fixes</p>
                </div>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 10,
                  background: "rgba(250,248,243,0.45)" }}>
                  <p className="raw" style={{ fontWeight: 600, margin: 0 }}>Full resume audit</p>
                  <button className="primary" onClick={() => onNavigate?.("upgrade")}>Unlock with Pro</button>
                </div>
              </article>
            </>
          )}

          {data.resume_audit && (
            <>
              <div className="eyebrow" style={{ marginTop: 18 }}>Resume audit</div>
              <article className="card">
                {data.resume_audit.summary && (
                  <p className="summary">{data.resume_audit.summary}</p>
                )}
                {data.resume_audit.strengths?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <p className="raw" style={{ fontWeight: 600, margin: "0 0 4px" }}>Strengths</p>
                    {data.resume_audit.strengths.map((s, i) => (
                      <p className="raw" key={i} style={{ margin: "0 0 3px" }}>- {s}</p>
                    ))}
                  </div>
                )}
                {data.resume_audit.weaknesses?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <p className="raw" style={{ fontWeight: 600, margin: "0 0 4px" }}>Weaknesses</p>
                    {data.resume_audit.weaknesses.map((s, i) => (
                      <p className="raw" key={i} style={{ margin: "0 0 3px" }}>- {s}</p>
                    ))}
                  </div>
                )}
                {data.resume_audit.ats_issues?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <p className="raw" style={{ fontWeight: 600, margin: "0 0 4px", color: "var(--marigold)" }}>
                      ATS issues</p>
                    {data.resume_audit.ats_issues.map((s, i) => (
                      <p className="raw" key={i} style={{ margin: "0 0 3px" }}>- {s}</p>
                    ))}
                  </div>
                )}
                {data.resume_audit.fixes?.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <p className="raw" style={{ fontWeight: 600, margin: "0 0 4px", color: "var(--ok)" }}>
                      Suggested fixes</p>
                    {data.resume_audit.fixes.map((s, i) => (
                      <p className="raw" key={i} style={{ margin: "0 0 3px" }}>- {s}</p>
                    ))}
                  </div>
                )}
              </article>
            </>
          )}

          {data.demand_source?.includes("Adzuna") && (
            <p className="raw" style={{ marginTop: 16, fontSize: 11, color: "var(--ink-faint)",
              textAlign: "center" }}>
              Job market data powered by{" "}
              <a href="https://www.adzuna.in/" target="_blank" rel="noopener noreferrer"
                style={{ color: "var(--ink-soft)", textDecoration: "underline" }}>Adzuna</a>
            </p>
          )}

          {/* ── Cover letter ──────────────────────────────────────────────── */}
          <div style={{
            marginTop: 26, borderTop: "1px solid var(--line)", paddingTop: 20,
          }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Cover letter</div>
            <p className="sub" style={{ margin: "0 0 14px" }}>
              Draft a tailored cover letter using your detected skills.
            </p>

            {isPro ? (
              <>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Target role / company (optional)</label>
                  <input
                    value={clRole}
                    onChange={(e) => setClRole(e.target.value)}
                    placeholder="e.g. Backend Engineer at Razorpay"
                    onKeyDown={(e) => e.key === "Enter" && draftCoverLetter()}
                  />
                </div>

                {clErr && <div className="err">{clErr}</div>}

                <button
                  className="btn full"
                  onClick={draftCoverLetter}
                  disabled={clBusy}
                  style={{ marginBottom: clLetter ? 16 : 0 }}
                >
                  {clBusy ? <span className="spin" /> : "✍ Draft cover letter using my skills"}
                </button>

                {clLetter && (
                  <div style={{
                    position: "relative",
                    background: "var(--surface-2)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--r)",
                    padding: "16px 18px",
                  }}>
                    <button
                      onClick={copyLetter}
                      style={{
                        position: "absolute", top: 10, right: 12,
                        fontSize: 11, padding: "4px 10px", borderRadius: 8,
                        border: `1px solid ${copied ? "var(--ok)" : "var(--line)"}`,
                        background: copied ? "rgba(92,127,98,.1)" : "var(--surface)",
                        color: copied ? "var(--ok)" : "var(--ink-soft)",
                        cursor: "pointer", transition: "all .15s",
                      }}
                    >
                      {copied ? "✓ Copied" : "Copy"}
                    </button>
                    <pre style={{
                      fontFamily: "var(--mono, monospace)", fontSize: 13,
                      lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word",
                      margin: 0, paddingRight: 48, color: "var(--ink)",
                    }}>{clLetter}</pre>
                  </div>
                )}
              </>
            ) : (
              <article className="card" style={{ position: "relative", overflow: "hidden" }}>
                <div style={{ filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
                  <p className="summary">Dear Hiring Manager,</p>
                  <p className="raw">I am excited to apply for the role… [personalised with your skills]</p>
                </div>
                <div style={{
                  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 10,
                  background: "rgba(250,248,243,0.45)",
                }}>
                  <p className="raw" style={{ fontWeight: 600, margin: 0 }}>AI cover letter drafting</p>
                  <button className="primary" onClick={() => onNavigate?.("upgrade")}>Unlock with Pro</button>
                </div>
              </article>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
