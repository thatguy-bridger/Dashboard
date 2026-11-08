// When the page refreshes itself. Pure, so it can be tested.

export type PulseConfig = { pulseMin?: number; reloadMin?: number; versionMin?: number };
export const PULSE_DEFAULTS = { pulseMin: 4, reloadMin: 60, versionMin: 5 };
export const resolvePulse = (c?: PulseConfig | null) => {
  const n = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return { pulseMin: n(c?.pulseMin, PULSE_DEFAULTS.pulseMin, 1, 60), reloadMin: n(c?.reloadMin, PULSE_DEFAULTS.reloadMin, 10, 24 * 60), versionMin: n(c?.versionMin, PULSE_DEFAULTS.versionMin, 1, 60) };
};

/** A soft full reload is due once the page is old enough, or a new version has been deployed, but never while something is happening on screen. */
export function reloadDue(o: { now: number; loadedAt: number; scene: string; newVersion: boolean; reloadMin: number; interacting: boolean }): boolean {
  const calm = o.scene !== "soon" && !o.interacting;
  const old = o.now - o.loadedAt >= o.reloadMin * 60000;
  const veryOld = o.now - o.loadedAt >= o.reloadMin * 60000 * 2;      // don't wait for ever
  return (old || o.newVersion) && (calm || veryOld) && !o.interacting;
}
