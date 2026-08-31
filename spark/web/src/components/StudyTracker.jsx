import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api.js";

const TIMER_STORAGE_KEY = "spark_active_study_timer";

export default function StudyTracker() {
  // Input fields
  const [subject, setSubject] = useState("");
  const [material, setMaterial] = useState("");
  const [timerMode, setTimerMode] = useState("stopwatch"); // "stopwatch" | "manual"
  const [manualMinutes, setManualMinutes] = useState("");

  // Live Timer State
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const startTimeRef = useRef(null);

  // Weekly Goal Form
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [targetHoursInput, setTargetHoursInput] = useState("7");

  // Data states from backend
  const [sessions, setSessions] = useState([]);
  const [todayStats, setTodayStats] = useState(null);
  const [weeklyGoal, setWeeklyGoal] = useState(null);
  const [feed, setFeed] = useState([]);
  const [subjectBreakdown, setSubjectBreakdown] = useState([]);

  // Async states
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Restore live timer state from localStorage across refreshes safely
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TIMER_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.subject) setSubject(parsed.subject);
        if (parsed.material) setMaterial(parsed.material);
        if (parsed.isActive && parsed.startTime) {
          const now = Date.now();
          const elapsed = Math.floor((now - parsed.startTime) / 1000);
          setSeconds(Math.max(0, (parsed.baseSeconds || 0) + elapsed));
          setIsActive(true);
          startTimeRef.current = parsed.startTime;
        } else if (parsed.baseSeconds) {
          setSeconds(parsed.baseSeconds);
        }
      }
    } catch (e) {
      console.warn("Timer storage restore error:", e);
    }
  }, []);

  // Update timer tick & sync to localStorage
  useEffect(() => {
    let interval = null;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds((prev) => {
          const next = prev + 1;
          try {
            localStorage.setItem(
              TIMER_STORAGE_KEY,
              JSON.stringify({
                subject,
                material,
                isActive: true,
                baseSeconds: next,
                startTime: startTimeRef.current || Date.now(),
              })
            );
          } catch (e) {}
          return next;
        });
      }, 1000);
    } else {
      clearInterval(interval);
      try {
        if (seconds > 0) {
          localStorage.setItem(
            TIMER_STORAGE_KEY,
            JSON.stringify({
              subject,
              material,
              isActive: false,
              baseSeconds: seconds,
            })
          );
        } else {
          localStorage.removeItem(TIMER_STORAGE_KEY);
        }
      } catch (e) {}
    }
    return () => clearInterval(interval);
  }, [isActive, subject, material, seconds]);

  // Load all study data from backend APIs
  const loadData = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [sessData, todayData, goalData, feedData, breakdownData] = await Promise.all([
        api.getStudySessions().catch(() => []),
        api.getTodayStudyStats().catch(() => null),
        api.getWeeklyGoal().catch(() => null),
        api.getStudyFeed().catch(() => []),
        api.getStudySubjectBreakdown().catch(() => []),
      ]);

      setSessions(Array.isArray(sessData) ? sessData : []);
      setTodayStats(todayData);
      setWeeklyGoal(goalData);
      setFeed(Array.isArray(feedData) ? feedData : []);
      setSubjectBreakdown(Array.isArray(breakdownData) ? breakdownData : []);
    } catch (error) {
      console.error("Load study data error:", error);
      setErr(error.message || "Failed to load study dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Timer controls
  const handleStartTimer = () => {
    if (!subject.trim()) {
      setErr("Please enter a Subject (e.g. Mathematics, Physics, Coding) before starting.");
      return;
    }
    setErr("");
    startTimeRef.current = Date.now();
    setIsActive(true);
  };

  const handlePauseTimer = () => {
    setIsActive(false);
  };

  const handleResetTimer = () => {
    setIsActive(false);
    setSeconds(0);
    localStorage.removeItem(TIMER_STORAGE_KEY);
  };

  // Submit Session
  const handleSaveSession = async (e) => {
    e?.preventDefault();
    const subj = subject.trim();
    const mat = material.trim();

    if (!subj) {
      setErr("Please enter a Subject (e.g. Mathematics, Physics, Coding).");
      return;
    }

    let minutesToSave = 0;
    let secondsToSave = 0;

    if (timerMode === "stopwatch") {
      secondsToSave = seconds;
      minutesToSave = Math.floor(seconds / 60);
      if (secondsToSave < 10) {
        setErr("Timer duration is too short. Please study for a measurable amount of time before saving.");
        return;
      }
    } else {
      const parsedMins = parseInt(manualMinutes, 10);
      if (isNaN(parsedMins) || parsedMins <= 0) {
        setErr("Please enter a valid study duration in minutes (greater than 0).");
        return;
      }
      minutesToSave = parsedMins;
      secondsToSave = parsedMins * 60;
    }

    setBusy(true);
    setErr("");
    setSuccessMsg("");

    try {
      const savedLog = await api.createStudySession(subj, mat, minutesToSave, secondsToSave);

      // Immediately refresh DB records
      await loadData();

      // Reset timer form
      setIsActive(false);
      setSeconds(0);
      setManualMinutes("");
      setMaterial("");
      localStorage.removeItem(TIMER_STORAGE_KEY);

      setSuccessMsg(`Session saved! Logged ${savedLog.duration_formatted || `${minutesToSave} min`} of ${subj}.`);
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (error) {
      console.error("Save session error:", error);
      setErr(error.message || "Couldn't save your study session. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Save Weekly Goal
  const handleSaveGoal = async (e) => {
    e?.preventDefault();
    const hrs = parseFloat(targetHoursInput);
    if (isNaN(hrs) || hrs <= 0 || hrs > 168) {
      setErr("Please enter valid target hours per week (e.g. 7 or 10).");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      const updatedGoal = await api.setWeeklyGoal(hrs);
      setWeeklyGoal(updatedGoal);
      setShowGoalForm(false);
      setSuccessMsg(`Weekly study goal updated to ${hrs} hours!`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (error) {
      console.error("Save goal error:", error);
      setErr(error.message || "Failed to set weekly study goal.");
    } finally {
      setBusy(false);
    }
  };

  const formatTimerDigits = (totalSec) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="screen">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ color: "var(--marigold-dark)" }}>Spark Focus Engine</div>
        <h1 className="title" style={{ fontSize: 26, margin: 0 }}>Study Dashboard</h1>
        <p className="sub" style={{ margin: "4px 0 0", fontSize: 14 }}>
          Track real focus sessions, monitor weekly goal progress, view your authenticated activity ledger, and receive personalized AI study recommendations.
        </p>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--ink-soft)", fontSize: 14 }}>
          <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading your authenticated study data…
        </div>
      )}

      {err && <div className="err" style={{ marginBottom: 16, fontSize: 13.5 }}>⚠️ {err}</div>}
      {successMsg && (
        <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#059669", padding: "10px 14px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>
          ✅ {successMsg}
        </div>
      )}

      {!loading && (
        <>
          {/* Today's Overview Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div className="card" style={{ marginBottom: 0, textAlign: "center", padding: 14 }}>
              <div className="eyebrow" style={{ fontSize: 11 }}>Today's Focus</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                {todayStats?.durationFormatted || "0 min"}
              </div>
            </div>
            <div className="card" style={{ marginBottom: 0, textAlign: "center", padding: 14 }}>
              <div className="eyebrow" style={{ fontSize: 11 }}>Today's Sessions</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
                {todayStats?.sessions ?? 0}
              </div>
            </div>
            <div className="card" style={{ marginBottom: 0, textAlign: "center", padding: 14 }}>
              <div className="eyebrow" style={{ fontSize: 11 }}>Total History</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--marigold-dark)", marginTop: 2 }}>
                {sessions.length} logged
              </div>
            </div>
          </div>

          {/* SECTION 1 & 2: STUDY SESSION & LIVE TIMER TRACKING */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>📖 Focus Terminal & Session Log</h3>
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Record live stopwatch time or log completed study duration</span>
              </div>
              <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 3, borderRadius: 10, border: "1px solid var(--line)" }}>
                <button
                  type="button"
                  onClick={() => setTimerMode("stopwatch")}
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "none",
                    background: timerMode === "stopwatch" ? "var(--marigold)" : "transparent",
                    color: timerMode === "stopwatch" ? "#fff" : "var(--ink-soft)",
                    cursor: "pointer",
                  }}
                >
                  Live Timer
                </button>
                <button
                  type="button"
                  onClick={() => setTimerMode("manual")}
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: "none",
                    background: timerMode === "manual" ? "var(--marigold)" : "transparent",
                    color: timerMode === "manual" ? "#fff" : "var(--ink-soft)",
                    cursor: "pointer",
                  }}
                >
                  Manual Input
                </button>
              </div>
            </div>

            {/* Subject & Material Form */}
            <form onSubmit={handleSaveSession}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4, color: "var(--ink-soft)" }}>
                    Subject *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mathematics, Physics, Coding, Economics"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4, color: "var(--ink-soft)" }}>
                    Material / Topic (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Calculus — Integration, Quantum Mechanics, React Hooks"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14 }}
                  />
                </div>
              </div>

              {/* Timer vs Manual Input View */}
              {timerMode === "stopwatch" ? (
                <div style={{ textAlign: "center", padding: "18px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", margin: "14px 0" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 46, fontWeight: 800, color: isActive ? "#059669" : "var(--marigold-dark)", letterSpacing: ".04em" }}>
                    {formatTimerDigits(seconds)}
                  </div>
                  {isActive && (
                    <div style={{ fontSize: 12, color: "#059669", fontWeight: 700, marginTop: 4 }}>
                      🟢 Live Focus Session Active
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
                    {!isActive ? (
                      <button
                        type="button"
                        onClick={handleStartTimer}
                        style={{
                          padding: "8px 24px",
                          borderRadius: 8,
                          border: "none",
                          background: "#059669",
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        ▶ Start Focus
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePauseTimer}
                        style={{
                          padding: "8px 24px",
                          borderRadius: 8,
                          border: "none",
                          background: "#D97706",
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        ⏸ Pause
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleResetTimer}
                      disabled={seconds === 0}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "1px solid var(--line)",
                        background: "var(--surface-2)",
                        color: "var(--ink-soft)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: seconds === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      ↺ Reset
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "14px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", margin: "14px 0" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 4, color: "var(--ink-soft)" }}>
                    Duration Spent (Minutes) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 45"
                    value={manualMinutes}
                    onChange={(e) => setManualMinutes(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 14 }}
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !subject.trim() || (timerMode === "stopwatch" && seconds < 10 && !isActive) || (timerMode === "manual" && !manualMinutes)}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  borderRadius: "var(--r-s)",
                  border: "none",
                  background: busy || !subject.trim() ? "var(--line)" : "var(--p-gradient)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: busy || !subject.trim() ? "not-allowed" : "pointer",
                }}
              >
                {busy ? "Saving Session to DB…" : "✅ Save Study Session"}
              </button>
            </form>
          </div>

          {/* SECTION 4: WEEKLY GOAL PROGRESS */}
          <div className="card" style={{ padding: 18, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>🎯 Weekly Study Goal</div>
              <button
                type="button"
                onClick={() => setShowGoalForm(!showGoalForm)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "var(--surface-2)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--marigold-dark)",
                  cursor: "pointer",
                }}
              >
                {weeklyGoal?.hasGoal ? "Edit Goal" : "+ Set Goal"}
              </button>
            </div>

            {showGoalForm && (
              <form onSubmit={handleSaveGoal} style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, marginBottom: 14, display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="168"
                  value={targetHoursInput}
                  onChange={(e) => setTargetHoursInput(e.target.value)}
                  placeholder="Target hours (e.g. 7)"
                  style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: "1px solid var(--line)", fontSize: 13 }}
                />
                <button
                  type="submit"
                  disabled={busy}
                  style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "var(--p-gradient)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  Save Target
                </button>
              </form>
            )}

            {!weeklyGoal?.hasGoal ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: "var(--ink-soft)" }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>🎯</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>No weekly goal set</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
                  Set a weekly target hours goal to track your completed study time and progress.
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                    Target: {weeklyGoal.targetHours} hours / week
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "3px 10px", borderRadius: 12 }}>
                    {weeklyGoal.progressPct}% completed
                  </span>
                </div>

                {/* Progress Bar */}
                <div style={{ height: 10, background: "var(--line)", borderRadius: 5, overflow: "hidden", marginBottom: 8 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${weeklyGoal.progressPct}%`,
                      background: "var(--p-gradient)",
                      transition: "width .4s ease",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-soft)" }}>
                  <span>Completed: <b>{weeklyGoal.completedFormatted}</b></span>
                  <span>Remaining: <b>{weeklyGoal.remainingFormatted}</b></span>
                  <span><b>{weeklyGoal.daysLeft} days left</b> this week</span>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5 & 6: AI STUDY FEED & RECOMMENDATIONS */}
          <div className="card" style={{ padding: 18, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", marginBottom: 12 }}>⚡ Personalized Study Feed & AI Recommendations</div>

            {feed.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)" }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>🤖</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Your study intelligence will appear here</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
                  As you log study sessions and solve academic tasks, Spark AI will generate personalized recommendations tailored to your progress.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {feed.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--line)",
                      padding: 14,
                      borderRadius: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--marigold-dark)", marginBottom: 2 }}>
                        💡 {item.subject}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                        {item.content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 3: ACTIVITY LEDGER */}
          <div className="card" style={{ padding: 18, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--ink)" }}>📊 Activity Ledger</h3>
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Your authenticated session history</span>
            </div>

            {sessions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)" }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>📝</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>No study activity recorded yet</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
                  Start your first session above to begin tracking your progress and subject activity.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sessions.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      background: "var(--surface-2)",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
                        {log.subject}
                      </div>
                      {log.material && (
                        <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
                          {log.material}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>
                        {log.date_formatted} · {log.start_time} - {log.end_time}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "4px 10px", borderRadius: 12 }}>
                        {log.duration_formatted}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
