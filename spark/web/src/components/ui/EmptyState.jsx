import React from "react";

export default function EmptyState({
  icon = "📁",
  title = "No data found",
  description = "Get started by creating your first item.",
  actionLabel,
  onAction,
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "36px 20px",
        background: "var(--surface-2)",
        border: "1px dashed var(--line)",
        borderRadius: "var(--r)",
        margin: "12px 0",
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px", color: "var(--ink)" }}>
        {title}
      </h3>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 16px", maxWidth: 360, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "none",
            background: "var(--p-gradient)",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
