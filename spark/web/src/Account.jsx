import React, { useState } from "react";
import { api, setToken } from "./api.js";
import Avatar, { AVATAR_PRESETS, getPreset } from "./components/Avatar.jsx";

export default function Account({ user = {}, onLogout, onUpdateUser }) {
  const [busy, setBusy] = useState(false);
  const [updatingPreset, setUpdatingPreset] = useState(false);
  const [err, setErr] = useState("");

  const logout = () => {
    setBusy(true);
    setToken("");
    onLogout?.();
  };

  const handleSelectPreset = async (presetId) => {
    if (updatingPreset || user?.avatar_url === presetId) return;
    setUpdatingPreset(true);
    setErr("");
    try {
      const updatedUser = await api.updateAvatarPreset(presetId);
      onUpdateUser?.(updatedUser);
    } catch (error) {
      setErr(error.message || "Failed to update avatar persona.");
    } finally {
      setUpdatingPreset(false);
    }
  };

  const isPro = user?.plan === "pro";
  const cardCount = user?.card_count || 0;
  const freeLimit = user?.free_card_limit || 1;
  const pct = Math.min(100, Math.round((cardCount / freeLimit) * 100));
  const currentPreset = getPreset(user?.avatar_url, user?.name);

  return (
    <div className="screen">
      <div className="eyebrow">Account</div>

      {/* Profile Header & Abstract Persona Avatar Display */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: 24,
          marginBottom: 16,
          boxShadow: "var(--sh-sm)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 12,
        }}
      >
        <div style={{ position: "relative" }}>
          <Avatar src={user?.avatar_url} name={user?.name || "User"} size={88} />
        </div>

        <div>
          <h1 className="title" style={{ fontSize: 22, margin: 0 }}>
            {user?.name || "Your account"}
          </h1>
          <p className="sub" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
            {user?.email}
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
              fontSize: 12,
              fontWeight: 600,
              color: "var(--marigold-dark)",
              background: "var(--marigold-light)",
              padding: "4px 12px",
              borderRadius: 16,
            }}
          >
            <span>{currentPreset.icon}</span>
            <span>Persona: {currentPreset.name}</span>
          </div>
        </div>

        {err && <div className="err" style={{ width: "100%", margin: "4px 0 0", fontSize: 13 }}>{err}</div>}

        {/* Persona Avatar Picker Selector */}
        <div style={{ width: "100%", marginTop: 8 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".05em",
              color: "var(--ink-soft)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Choose Persona Avatar
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: 10,
              justifyItems: "center",
            }}
          >
            {AVATAR_PRESETS.map((p) => {
              const isSelected = (user?.avatar_url === p.id) || (currentPreset.id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPreset(p.id)}
                  disabled={updatingPreset}
                  title={p.name}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 4,
                    cursor: updatingPreset ? "not-allowed" : "pointer",
                    borderRadius: "50%",
                    outline: isSelected ? "3px solid var(--marigold)" : "none",
                    outlineOffset: 2,
                    transition: "transform .15s ease",
                    transform: isSelected ? "scale(1.1)" : "scale(1)",
                  }}
                >
                  <Avatar src={p.id} name={user?.name || "User"} size={36} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Plan Card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: 20,
          marginBottom: 16,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Plan</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: 20,
              background: isPro
                ? "linear-gradient(135deg, var(--marigold), var(--marigold-dark))"
                : "var(--surface-2)",
              color: isPro ? "#fff" : "var(--ink-soft)",
            }}
          >
            {isPro ? "Pro" : "Free"}
          </span>
        </div>

        {!isPro && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12.5,
                color: "var(--ink-soft)",
                marginBottom: 6,
              }}
            >
              <span>Cards used</span>
              <span>
                {cardCount} / {freeLimit}
              </span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--marigold)" }} />
            </div>
          </>
        )}

        {isPro && user?.plan_until && (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
            Renews{" "}
            {new Date(user.plan_until).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        )}
      </div>

      <button
        onClick={logout}
        disabled={busy}
        className="btn sm"
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: "var(--r-s)",
          border: "1px solid var(--line)",
          background: "var(--surface-2)",
          color: "var(--ink-soft)",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {busy ? "Logging out…" : "Log out"}
      </button>
    </div>
  );
}
