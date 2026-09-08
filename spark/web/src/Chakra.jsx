import React from "react";
import sparkDhiLogo from "./assets/sparkdhi-logo.png";

/**
 * SparkDhi Official Brand Mark
 * Uses the official SparkDhi.ai visual brand asset.
 *
 * @param {number}  size      — pixel dimensions (default 36)
 * @param {string}  variant   — "light" | "dark" | "auto" (default "auto")
 * @param {boolean} animated  — apply gentle hover micro-interaction
 * @param {string}  className — extra class names
 * @param {object}  style     — custom style overrides
 * @param {string}  alt       — accessibility text
 */
export function Chakra({
  size = 36,
  variant = "auto",
  animated = false,
  className = "",
  style = {},
  alt = "SparkDhi.ai",
}) {
  const borderRadius = Math.max(4, Math.round(size * 0.22));

  return (
    <img
      src={sparkDhiLogo}
      alt={alt}
      width={size}
      height={size}
      className={`sparkdhi-brand-logo ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${borderRadius}px`,
        objectFit: "cover",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        boxShadow:
          variant === "dark"
            ? "0 2px 10px rgba(0, 0, 0, 0.4)"
            : "0 2px 8px rgba(235, 140, 50, 0.18)",
        transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease",
        ...style,
      }}
      loading="eager"
    />
  );
}

export default Chakra;
