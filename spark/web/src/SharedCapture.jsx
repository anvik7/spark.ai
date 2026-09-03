import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { Chakra } from "./Chakra.jsx";

export default function SharedCapture({ shareToken }) {
  const [capture, setCapture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getPublicCapture(shareToken)
      .then(setCapture)
      .catch((e) => setErr(e.message || "Shared capture not found or link has been revoked."))
      .finally(() => setLoading(false));
  }, [shareToken]);

  if (loading) {
    return (
      <div style={{ maxWidth: 520, margin: "60px auto", padding: 16, textAlign: "center" }}>
        <div className="skeleton" style={{ height: 140, borderRadius: 10 }} />
      </div>
    );
  }

  if (err || !capture) {
    return (
      <div style={{ maxWidth: 520, margin: "60px auto", padding: 20, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>
          Capture Unavailable
        </h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5, margin: "0 0 16px" }}>
          {err || "This shared capture is private or its share link was revoked by the owner."}
        </p>
        <a href="/" style={{ fontSize: 13, fontWeight: 700, color: "var(--marigold-dark)", textDecoration: "none" }}>
          ← Back to Spark Home
        </a>
      </div>
    );
  }

  const creatorName = capture.creator_name || "Spark Creator";
  const displayTag = (capture.tags && capture.tags[0]) || capture.kind || "capture";
  const formattedDate = new Date(capture.created_at || Date.now()).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div style={{ maxWidth: 520, margin: "30px auto", padding: "0 16px 40px", boxSizing: "border-box" }}>
      {/* Branding Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Chakra size={20} />
          <span className="logo-mark" style={{ fontSize: 17, fontWeight: 700 }}>Spark Shared Capture</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "2px 8px", borderRadius: 6 }}>
          Public Note
        </span>
      </div>

      {/* Shared Capture Card — Identical to Saved Capture Card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: 16,
          boxShadow: "var(--sh-sm)",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Metadata Header Row: date/time | tag | creator/avatar + name */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: "var(--ink-faint)", fontWeight: 500 }}>
              {formattedDate}
            </span>

            <span style={{ fontSize: 11, color: "var(--line)" }}>•</span>

            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--marigold-dark)",
                background: "var(--marigold-light)",
                padding: "2px 6px",
                borderRadius: 6,
                letterSpacing: ".02em",
              }}
            >
              {displayTag}
            </span>

            <span style={{ fontSize: 11, color: "var(--line)" }}>|</span>

            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "var(--ink-soft)" }}>
              <span style={{ fontSize: 12 }}>👤</span>
              <span>{creatorName.startsWith("@") ? creatorName : `@${creatorName}`}</span>
            </span>
          </div>
        </div>

        {/* Capture Content - EXACT Original Content Preserved */}
        <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 12 }}>
          {capture.raw || capture.title || capture.summary}
        </div>

        {capture.source_url && (
          <a
            href={capture.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "var(--marigold-dark)", textDecoration: "none", marginTop: 4, marginBottom: 12, display: "inline-block", wordBreak: "break-all" }}
          >
            🔗 {capture.source_url}
          </a>
        )}

        {/* Action Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>
            Saved via Spark
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={async () => {
                const url = window.location.href;
                await navigator.clipboard?.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--marigold)",
                background: "var(--marigold-light)",
                color: "var(--marigold-dark)",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {copied ? "✓ Copied!" : "📋 Copy Link"}
            </button>
            <a
              href="/"
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                color: "var(--ink)",
                fontSize: 11.5,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              🚀 Open Spark
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
