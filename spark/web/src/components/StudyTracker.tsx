import React, { useState, useEffect } from "react";

export default function StudyTracker() {
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

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleLogSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const minutes = timerMode === 'stopwatch'
      ? Math.round(seconds / 60)
      : Math.round(parseFloat(manualHours || "0") * 60);
    if (!subject.trim() || minutes <= 0) { alert('Enter a subject and duration.'); return; }
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Study Timer</h2>
      <form onSubmit={handleLogSession}>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
        />
        <div>Timer: {formatTime(seconds)}</div>
        <button type="button" onClick={() => setIsActive(!isActive)}>
          {isActive ? "Pause" : "Start"}
        </button>
        <button type="submit">Log Session</button>
      </form>
    </div>
  );
}
