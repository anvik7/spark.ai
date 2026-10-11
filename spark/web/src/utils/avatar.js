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

export function getInitials(name) {
  if (!name || typeof name !== "string") return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0] ? parts[0][0].toUpperCase() : "U";
}

export function isImageAvatarUrl(src) {
  if (!src || typeof src !== "string") return false;
  const s = src.trim();
  if (s.startsWith("preset-")) return false;
  return (
    s.startsWith("/api/") ||
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("blob:") ||
    s.startsWith("data:image/")
  );
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
