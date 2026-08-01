import React, { useState } from "react";
import { setToken } from "./api.js";

export default function Account({ user = {}, onLogout }) {
  const [busy, setBusy] = useState(false);

  const logout = () => {
    setBusy(true);
    setToken("");
    onLogout?.();
  };

  const isPro = user?.plan === "pro";
  const cardCount = user?.card_count || 0;
  const freeLimit = user?.free_card_limit || 1;
  const pct = Math.min(100, Math.round((cardCount / freeLimit) * 100));

  return (
    <div className="screen">
      <div className="eyebrow">Account</div>
      <h1 className="title">{user?.name || "Your account"}</h1>
      <p className="sub">{user?.email}</p>

      <div style={{
        background: "var(--surface)", border: "1.5px solid var(--line)",
        borderRadius: "var(--r)", padding: 20, marginTop: 16, marginBottom: 16,
        boxShadow: "var(--sh-sm)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Plan</span>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
            background: isPro ? "linear-gradient(135deg, var(--marigold), var(--marigold-dark))" : "var(--surface-2)",
            color: isPro ? "#fff" : "var(--ink-soft)",
          }}>
            {isPro ? "Pro" : "Free"}
          </span>
        </div>

        {!isPro && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 6 }}>
              <span>Cards used</span>
              <span>{cardCount} / {freeLimit}</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--marigold)" }} />
            </div>
          </>
        )}

        {isPro && user?.plan_until && (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
            Renews {new Date(user.plan_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        )}
      </div>

      <button
        onClick={logout}
        disabled={busy}
        className="btn sm"
        style={{
          width: "100%", padding: "12px 16px", borderRadius: "var(--r-s)",
          border: "1px solid var(--line)", background: "var(--surface-2)",
          color: "var(--ink-soft)", fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}
      >
        Log out
      </button>
    </div>
  );
}
