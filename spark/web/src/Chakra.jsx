import React from "react";

/**
 * Spark Chakra — Brand Mark
 *
 * A modern geometric symbol derived from the visual language of the
 * Sudarshana Chakra: circular motion, precision, radiance, clarity, power.
 *
 * Anatomy:
 *  1. Outer ring — the discus boundary
 *  2. 12 tapered radial blades — rotational motion & precision
 *  3. Inner ring — depth & layering
 *  4. 12 outer energy points — radiance emanation
 *  5. Central core — axis of rotation / focus
 *
 * @param {number}  size     — pixel dimensions (default 36)
 * @param {string}  variant  — "light" | "dark" | "auto" (default "auto")
 * @param {boolean} animated — apply CSS spin class (default true)
 */
export function Chakra({ size = 36, variant = "auto", animated = true }) {
  // Unique gradient ID per instance to avoid SVG id collisions
  const id = React.useId ? React.useId() : React.useMemo(() => `sc${Math.random().toString(36).slice(2, 8)}`, []);

  // Gradient stops per variant
  const gradients = {
    light: { a: "#B8872A", b: "#D4A43A", c: "#C6952B" },  // warm champagne gold on white
    dark:  { a: "#E8C56D", b: "#F5DFA0", c: "#EDD490" },  // luminous gold on dark
  };

  const resolvedVariant = variant === "auto" ? "light" : variant;
  const g = gradients[resolvedVariant] || gradients.light;

  // ─── Blade geometry ────────────────────────────────────────
  // 12 tapered blades radiating from center (50,50) in a 100×100 viewBox.
  // Each blade is a slim triangle: narrow at center, wider at outer ring.
  const bladeCount = 12;
  const innerR = 16;   // blade start radius
  const outerR = 37;   // blade end radius
  const halfAngle = 5; // degrees — half-width of blade tip

  const blades = [];
  for (let i = 0; i < bladeCount; i++) {
    const angle = (i * 360) / bladeCount;
    const rad = (a) => (a * Math.PI) / 180;

    // Inner point (narrow base near center)
    const ix = 50 + innerR * Math.cos(rad(angle));
    const iy = 50 + innerR * Math.sin(rad(angle));

    // Outer left edge of blade
    const olx = 50 + outerR * Math.cos(rad(angle - halfAngle));
    const oly = 50 + outerR * Math.sin(rad(angle - halfAngle));

    // Outer tip (sharp point)
    const otx = 50 + (outerR + 3) * Math.cos(rad(angle));
    const oty = 50 + (outerR + 3) * Math.sin(rad(angle));

    // Outer right edge of blade
    const orx = 50 + outerR * Math.cos(rad(angle + halfAngle));
    const ory = 50 + outerR * Math.sin(rad(angle + halfAngle));

    blades.push(
      `M${ix.toFixed(2)},${iy.toFixed(2)} L${olx.toFixed(2)},${oly.toFixed(2)} L${otx.toFixed(2)},${oty.toFixed(2)} L${orx.toFixed(2)},${ory.toFixed(2)} Z`
    );
  }

  // ─── Outer energy points ───────────────────────────────────
  // 12 small diamond/dot accents between blades at the outer edge
  const energyR = 43; // radius for energy points
  const energyPoints = [];
  for (let i = 0; i < bladeCount; i++) {
    const angle = (i * 360) / bladeCount + 15; // offset 15° between blades
    const rad = (a) => (a * Math.PI) / 180;
    const cx = 50 + energyR * Math.cos(rad(angle));
    const cy = 50 + energyR * Math.sin(rad(angle));
    energyPoints.push({ cx: cx.toFixed(2), cy: cy.toFixed(2) });
  }

  return (
    <svg
      className={animated ? "logo-icon" : undefined}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Spark"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <defs>
        {/* Primary gradient — metallic gold sweep */}
        <linearGradient id={`${id}-g1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={g.a} />
          <stop offset="50%" stopColor={g.b} />
          <stop offset="100%" stopColor={g.a} />
        </linearGradient>
        {/* Radial gradient for the central core glow */}
        <radialGradient id={`${id}-g2`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={g.b} />
          <stop offset="100%" stopColor={g.c} />
        </radialGradient>
      </defs>

      {/* Layer 1: Outer Ring — the discus boundary */}
      <circle
        cx="50" cy="50" r="45"
        stroke={`url(#${id}-g1)`}
        strokeWidth="2.2"
        fill="none"
      />

      {/* Layer 2: 12 Tapered Radial Blades */}
      {blades.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={`url(#${id}-g1)`}
          opacity="0.88"
        />
      ))}

      {/* Layer 3: Inner Ring — depth layer */}
      <circle
        cx="50" cy="50" r="14"
        stroke={`url(#${id}-g1)`}
        strokeWidth="1.8"
        fill="none"
      />

      {/* Layer 4: Outer Energy Points — radiance emanation */}
      {energyPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r="1.3"
          fill={`url(#${id}-g1)`}
          opacity="0.7"
        />
      ))}

      {/* Layer 5: Central Core — axis of rotation */}
      <circle
        cx="50" cy="50" r="6"
        fill={`url(#${id}-g2)`}
      />

      {/* Inner core accent ring */}
      <circle
        cx="50" cy="50" r="9"
        stroke={`url(#${id}-g1)`}
        strokeWidth="0.8"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}
