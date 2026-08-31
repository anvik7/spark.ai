import React from "react";

export default function LimitReachedModal({
  isOpen,
  onClose,
  onUpgrade,
  title = "You've reached your Free plan limit",
  message = "You've used your available AI processing or download quota for this period. Continue learning with Spark Plus.",
  suggestedPlan = "plus",
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, padding: 24, textAlign: "center" }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>

        <h3 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "var(--ink)" }}>
          {title}
        </h3>

        <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5, margin: "0 0 20px" }}>
          {message}
        </p>

        <div
          style={{
            background: "var(--marigold-light, #FEF9EC)",
            border: "1px solid var(--marigold)",
            borderRadius: 10,
            padding: 14,
            marginBottom: 20,
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)" }}>
            Recommended Upgrade
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)", marginTop: 2 }}>
            Spark Plus — ₹499 <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-soft)" }}>/ month</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
            ✓ 100 AI calls/day · 1GB storage · 25 downloads/mo · Priority AI
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={() => {
              onClose();
              onUpgrade?.(suggestedPlan);
            }}
            style={{
              padding: "12px 20px",
              borderRadius: 8,
              border: "none",
              background: "var(--p-gradient)",
              color: "#ffffff",
              fontSize: 14.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Upgrade to Plus →
          </button>

          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--ink-soft)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel anytime
          </button>
        </div>
      </div>
    </div>
  );
}
