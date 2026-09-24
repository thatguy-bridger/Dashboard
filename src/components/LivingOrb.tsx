type OrbState = "idle" | "active" | "alert";

/**
 * The dashboard's one ambient "alive" element: a soft glow that breathes at
 * rest and pulses briefly when something changes. No face, no icon, no text.
 */
export function LivingOrb({
  state = "idle",
  size = 28,
}: {
  state?: OrbState;
  size?: number;
}) {
  const color = state === "alert" ? "var(--alert)" : "var(--accent-glow)";

  return (
    <div
      className="living-orb rounded-full"
      data-state={state}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 35%, ${color}, transparent 70%)`,
        boxShadow: `0 0 ${size}px ${size / 3}px ${color}55`,
      }}
      aria-hidden
    />
  );
}
