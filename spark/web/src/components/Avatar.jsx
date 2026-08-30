import React from "react";

export const AVATAR_PRESETS = [
  { id: "preset-1", name: "Cosmic Spark", bg: "linear-gradient(135deg, #8B5CF6, #EC4899)", icon: "✨" },
  { id: "preset-2", name: "Amber Pulse", bg: "linear-gradient(135deg, #F59E0B, #EF4444)", icon: "⚡" },
  { id: "preset-3", name: "Emerald Flow", bg: "linear-gradient(135deg, #10B981, #059669)", icon: "🌿" },
  { id: "preset-4", name: "Neon Cyber", bg: "linear-gradient(135deg, #06B6D4, #3B82F6)", icon: "🌐" },
  { id: "preset-5", name: "Solar Flare", bg: "linear-gradient(135deg, #F97316, #EAB308)", icon: "☀️" },
  { id: "preset-6", name: "Violet Nebula", bg: "linear-gradient(135deg, #6366F1, #A855F7)", icon: "🔮" },
  { id: "preset-7", name: "Ocean Crest", bg: "linear-gradient(135deg, #0284C7, #0D9488)", icon: "🌊" },
  { id: "preset-8", name: "Ruby Nova", bg: "linear-gradient(135deg, #E11D48, #9333EA)", icon: "💎" },
  { id: "preset-9", name: "Aurora Sky", bg: "linear-gradient(135deg, #34D399, #3B82F6)", icon: "🌌" },
  { id: "preset-10", name: "Golden Horizon", bg: "linear-gradient(135deg, #D97706, #B45309)", icon: "🌅" },
  { id: "preset-11", name: "Plasma Glow", bg: "linear-gradient(135deg, #EC4899, #8B5CF6)", icon: "🔥" },
  { id: "preset-12", name: "Midnight Prism", bg: "linear-gradient(135deg, #1E293B, #475569)", icon: "✺" },
];

function getInitials(name) {
  if (!name || typeof name !== "string") return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0] ? parts[0][0].toUpperCase() : "U";
}

export function getPreset(src, name = "User") {
  if (src && typeof src === "string" && src.startsWith("preset-")) {
    const found = AVATAR_PRESETS.find((p) => p.id === src);
    if (found) return found;
  }
  let hash = 0;
  const str = String(name || "User");
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_PRESETS.length;
  return AVATAR_PRESETS[idx];
}

export function Avatar({ src, name = "User", size = 36, style = {}, className = "" }) {
  const preset = getPreset(src, name);
  const initials = getInitials(name);
  const fontSize = Math.max(11, Math.floor(size * 0.38));

  return (
    <div
      className={className}
      title={`${name} (${preset.name})`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: preset.bg,
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
        boxShadow: "0 2px 6px rgba(0,0,0,0.14)",
        border: "1.5px solid rgba(255,255,255,0.25)",
        position: "relative",
        ...style,
      }}
    >
      <span>{initials}</span>
      <span
        style={{
          position: "absolute",
          bottom: -2,
          right: -2,
          fontSize: Math.max(8, Math.floor(size * 0.32)),
          lineHeight: 1,
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
        }}
      >
        {preset.icon}
      </span>
    </div>
  );
}

export default Avatar;
