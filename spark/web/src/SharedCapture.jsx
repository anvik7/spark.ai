import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { Chakra } from "./Chakra.jsx";

export default function SharedCapture({ shareToken }) {
  const [capture, setCapture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    api.getPublicCapture(shareToken)
      .then(setCapture)
      .catch((e) => setErr(e.message || "Shared capture not found or link has been revoked."))
      .finally(() => setLoading(false));
  }, [shareToken]);

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: "60px auto", padding: 24, textAlign: "center" }}>
        <div className="skeleton" style={{ height: 140, borderRadius: 12 }} />
      </div>
    );
  }

  if (err || !capture) {
    return (
      <div style={{ maxWidth: 520, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", margin: "0 0 8px" }}>
          Capture Unavailable
        </h2>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5, margin: "0 0 20px" }}>
          {err || "This shared capture is private or its share link was revoked by the owner."}
        </p>
        <a href="/" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--marigold-dark)", textDecoration: "none" }}>
          ← Back to Spark Home
        </a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: "0 20px 60px" }}>
      {/* Branding Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Chakra size={22} />
          <span className="logo-mark" style={{ fontSize: 18 }}>Spark Shared Capture</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)", background: "var(--marigold-light)", padding: "2px 8px", borderRadius: 6 }}>
          Public Link
        </span>
      </div>

      {/* Shared Content Card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 12,
          padding: 20,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-faint)" }}>
            {capture.kind || "capture"}
          </span>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Shared via Spark
          </span>
        </div>

        {capture.title && (
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)", margin: "0 0 10px" }}>
            {capture.title}
          </h1>
        )}

        <div style={{ fontSize: 15, color: "var(--ink)", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 16 }}>
          {capture.raw || capture.summary}
        </div>

        {capture.source_url && (
          <a
            href={capture.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: "var(--marigold-dark)", textDecoration: "none", fontWeight: 600, display: "inline-block", marginBottom: 12 }}
          >
            🔗 {capture.source_url}
          </a>
        )}

        <div style={{ fontSize: 11.5, color: "var(--ink-faint)", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          Saved on {new Date(capture.created_at || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>
    </div>
  );
}
