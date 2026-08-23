import React, { useState } from "react";

export default function GoalSetting({ currentGoal, onSave }) {
  const [type, setType] = useState(currentGoal?.goal_type || "daily");
  const [hours, setHours] = useState(currentGoal?.target_hours || 2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ goal_type: type, target_hours: Number(hours) });
    } catch (e) {
      console.error("goal save failed:", e);
      setError("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: "var(--surface, #fff)",
      border: "1px solid var(--line, #E5E7EB)",
      borderRadius: "var(--r, 12px)",
      padding: 16,
      boxShadow: "var(--sh-sm, 0 1px 3px rgba(0,0,0,.07))",
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink, #111827)", marginBottom: 12 }}>
        Study goal
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["daily", "weekly"].map(t => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12.5,
              border: `1px solid ${type === t ? "var(--marigold, #F59E0B)" : "var(--line, #E5E7EB)"}`,
              background: type === t ? "var(--marigold-light, #FEF9EC)" : "var(--surface-2, #F8F9FA)",
              color: type === t ? "var(--marigold-dark, #D97706)" : "var(--ink-soft, #4B5563)",
              fontWeight: type === t ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {t === "daily" ? "Daily" : "Weekly"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <input
          type="number" min="0.5" max="24" step="0.5"
          value={hours}
          onChange={e => {
            setError(null);
            setHours(e.target.value);
          }}
          style={{
            width: 70, padding: "8px 10px", fontSize: 16, fontWeight: 700,
            border: "1px solid var(--line, #E5E7EB)", borderRadius: 8,
            color: "var(--ink, #111827)", textAlign: "center",
          }}
        />
        <span style={{ fontSize: 12.5, color: "var(--ink-faint, #9CA3AF)" }}>
          hours / {type === "daily" ? "day" : "week"}
        </span>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: "#DC2626", marginBottom: 8 }}>{error}</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: "100%", padding: "10px 0", borderRadius: 8,
          background: "var(--marigold, #F59E0B)", color: "#fff",
          fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Saving…" : currentGoal ? "Update goal" : "Set goal"}
      </button>
    </div>
  );
}
