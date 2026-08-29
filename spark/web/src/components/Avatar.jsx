import React, { useState } from "react";

const BG_COLORS = [
  "linear-gradient(135deg, #F59E0B, #D97706)",
  "linear-gradient(135deg, #6366F1, #4F46E5)",
  "linear-gradient(135deg, #10B981, #059669)",
  "linear-gradient(135deg, #8B5CF6, #7C3AED)",
  "linear-gradient(135deg, #EC4899, #DB2777)",
  "linear-gradient(135deg, #3B82F6, #2563EB)",
];

function getInitials(name) {
  if (!name || typeof name !== "string") return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0] ? parts[0][0].toUpperCase() : "U";
}

function getColorIndex(name) {
  if (!name) return 0;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % BG_COLORS.length;
}

export function Avatar({ src, name = "User", size = 36, style = {}, className = "" }) {
  const [imgError, setImgError] = useState(false);

  const fontSize = Math.max(10, Math.floor(size * 0.4));
  const bg = BG_COLORS[getColorIndex(name)];
  const initials = getInitials(name);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setImgError(true)}
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          border: "1px solid rgba(0,0,0,0.08)",
          ...style,
        }}
      />
    );
  }

  return (
    <div
      className={className}
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "#FFFFFF",
        fontWeight: 700,
        fontSize: fontSize,
        fontFamily: "var(--sans, Inter, sans-serif)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        letterSpacing: ".02em",
        userSelect: "none",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        ...style,
      }}
    >
      {initials}
    </div>
  );
}

export default Avatar;
