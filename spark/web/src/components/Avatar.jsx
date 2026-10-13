import React, { useState, useEffect } from "react";
import { resolveApiUrl } from "../api.js";
import { AVATAR_PRESETS, getInitials, isImageAvatarUrl, getPreset } from "../utils/avatar.js";

export { AVATAR_PRESETS, getInitials, isImageAvatarUrl, getPreset };

export function Avatar({ src, name = "User", size = 36, style = {}, className = "" }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const hasImage = isImageAvatarUrl(src) && !imgError;
  const preset = getPreset(src, name);
  const initials = getInitials(name);
  const fontSize = Math.max(11, Math.floor(size * 0.38));

  if (hasImage) {
    return (
      <div
        className={className}
        title={name}
        data-avatar-type="custom"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          boxShadow: "0 2px 6px rgba(0,0,0,0.14)",
          border: "1.5px solid rgba(255,255,255,0.25)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--surface-2, #F1F5F9)",
          position: "relative",
          ...style,
        }}
      >
        <img
          src={resolveApiUrl(src)}
          alt={name || "Profile picture"}
          onError={() => setImgError(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            borderRadius: "50%",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      title={name}
      data-avatar-type="initials"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: preset.bg || "linear-gradient(135deg, #334155, #1E293B)",
        color: "#FFFFFF",
        fontWeight: 600,
        fontSize: fontSize,
        fontFamily: "var(--sans, Inter, sans-serif)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        letterSpacing: ".02em",
        userSelect: "none",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        border: "1px solid rgba(255,255,255,0.15)",
        position: "relative",
        ...style,
      }}
    >
      <span>{initials}</span>
    </div>
  );
}

export default Avatar;
