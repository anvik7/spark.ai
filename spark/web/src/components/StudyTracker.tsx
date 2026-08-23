import React, { useState, useEffect } from 'react';
import { useStudyData } from './useStudyApi';

export default function StudyTracker() {
  const { logs, goals, feed, todayStats, loading, error, createLog, likePost } = useStudyData();

  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [timerMode, setTimerMode] = useState('stopwatch');
  const [subject, setSubject] = useState('');
  const [manualHours, setManualHours] = useState('');

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  const formatTime = (sec) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleLogSession = async (e) => {
    e.preventDefault();
    const minutes = timerMode === 'stopwatch'
      ? Math.round(seconds / 60)
      : Math.round(parseFloat(manualHours || "0") * 60);
    if (!subject.trim() || minutes <= 0) { alert('Enter a subject and duration.'); return; }
    await createLog({ subject: subject.trim(), duration: minutes, date: new Date().toISOString() });
    setSeconds(0); setIsActive(false); setManualHours('');
  };

  if (loading) return <div className="empty"><div className="empty-title">Loading…</div></div>;

  return (
    <div>
      {error && <div className="err">⚠️ {error}</div>}

      <div className="eyebrow">Spark Focus Engine</div>
      <div className="title">Study Dashboard</div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ flex: 1, marginBottom: 0, textAlign: "center" }}>
          <div className="eyebrow">Today</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)" }}>
            {todayStats ? `${Math.floor(todayStats.totalMinutes / 60)}h ${todayStats.totalMinutes % 60}m` : "0m"}
          </div>
        </div>
        <div className="card" style={{ flex: 1, marginBottom: 0, textAlign: "center" }}>
          <div className="eyebrow">Sessions</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink)" }}>
            {todayStats?.sessions ?? 0}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📖 Focus Terminal</div>
          <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 3, borderRadius: 10, border: "1px solid var(--line)" }}>
            <button type="button" onClick={() => setTimerMode('stopwatch')} className="btn sm"
              style={{ background: timerMode === 'stopwatch' ? "var(--marigold)" : "transparent", color: timerMode === 'stopwatch' ? "#fff" : "var(--ink-soft)", border: "none" }}>
              Live Timer
            </button>
            <button type="button" onClick={() => setTimerMode('manual')} className="btn sm"
              style={{ background: timerMode === 'manual' ? "var(--marigold)" : "transparent", color: timerMode === 'manual' ? "#fff" : "var(--ink-soft)", border: "none" }}>
              Manual Input
            </button>
          </div>
        </div>

        {timerMode === 'stopwatch' ? (
          <div style={{ textAlign: "center", padding: "20px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", margin: "12px 0" }}>
            <div style={{ fontFamily: "monospace", fontSize: 44, fontWeight: 800, color: "var(--marigold-dark)" }}>
              {formatTime(seconds)}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => setIsActive(!isActive)} className="primary" style={{ width: "auto", padding: "10px 28px" }}>
                {isActive ? '⏸ Pause' : '▶ Start Focus'}
              </button>
              <button type="button" onClick={() => { setSeconds(0); setIsActive(false); }} className="iconbtn" style={{ border: "1px solid var(--line)" }}>
                ↺
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: "16px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", margin: "12px 0" }}>
            <label className="eyebrow">Hours Spent</label>
            <input type="number" step="0.1" placeholder="e.g. 1.5" value={manualHours}
              onChange={e => setManualHours(e.target.value)} className="field" />
          </div>
        )}

        <form onSubmit={handleLogSession} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="text" placeholder="Subject / Material" value={subject}
            onChange={e => setSubject(e.target.value)} className="field" />
          <button type="submit" className="primary">+ Save Session</button>
        </form>
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>🎯 Goals</div>
        {goals.length === 0 ? (
          <div className="empty-sub" style={{ textAlign: "left", marginBottom: 0 }}>No goals set yet.</div>
        ) : goals.map(g => (
          <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{g.emoji} {g.title}</div>
              <div style={{ fontSize: 12, color: "var(--ink-faint)" }}>{g.daysLeft} days left</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "4px 10px", borderRadius: 20 }}>
              {g.progress}%
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>⚡ Study Feed</div>
        {feed.length === 0 ? (
          <div className="empty-sub" style={{ textAlign: "left", marginBottom: 0 }}>No posts yet.</div>
        ) : feed.map(p => (
          <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.user}</div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>{p.content}</div>
            <button type="button" onClick={() => likePost(p.id)} className="btn sm" style={{ marginTop: 6 }}>🔥 {p.likes}</button>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>📊 Activity Ledger</div>
        {logs.length === 0 ? (
          <div className="empty-sub" style={{ textAlign: "left", marginBottom: 0 }}>No sessions logged yet.</div>
        ) : logs.slice(0, 10).map(log => (
          <div key={log.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{log.subject}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--marigold-dark)" }}>
              {Math.floor(log.duration / 60)}h {log.duration % 60}m
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}