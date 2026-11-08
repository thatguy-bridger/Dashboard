// FOCUS vs CALM. Focus = something needs attention: the hero scene plus fixed zones (pills, strip, rail badges, a corner peek).
// Calm = nothing pressing for a while: calm full-screen pages that rotate. Switching has hysteresis so it never flickers.

export type FocusConfig = { focusThreshold?: number; calmAfterSec?: number; pageSec?: number };
export const FOCUS_DEFAULTS = { focusThreshold: 50, calmAfterSec: 90, pageSec: 20 };
export const resolveFocus = (c?: FocusConfig | null) => {
  const n = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return { focusThreshold: n(c?.focusThreshold, FOCUS_DEFAULTS.focusThreshold, 1, 100), calmAfterSec: n(c?.calmAfterSec, FOCUS_DEFAULTS.calmAfterSec, 0, 3600), pageSec: n(c?.pageSec, FOCUS_DEFAULTS.pageSec, 5, 300) };
};

export type Mode = "focus" | "calm";
export type ModeState = { mode: Mode; since: number; calmFrom: number | null };

/** Calm needs the hero scene to be plain idle AND nothing scoring at or above the threshold, continuously for calmAfterSec.
 *  Anything that wants attention (another scene, or a score at the threshold) returns to focus immediately. */
export function decideMode(prev: ModeState | null, o: { scene: string; score: number; now: number; cfg: ReturnType<typeof resolveFocus> }): ModeState {
  const quiet = o.scene === "idle" && o.score < o.cfg.focusThreshold - (prev?.mode === "calm" ? 0 : 10);   // entering calm needs a clear margin; once calm, only the threshold itself ends it
  if (!quiet) return prev?.mode === "focus" ? { ...prev, calmFrom: null } : { mode: "focus", since: o.now, calmFrom: null };
  if (prev?.mode === "calm") return prev;
  const calmFrom = prev?.calmFrom ?? o.now;
  return o.now - calmFrom >= o.cfg.calmAfterSec * 1000 ? { mode: "calm", since: o.now, calmFrom } : { mode: "focus", since: prev?.since ?? o.now, calmFrom };
}

/** Which calm page is up: derived from the clock, so every screen shows the same page and a reload doesn't restart the cycle. */
export function rotation(pages: string[], now: number, pageSec: number): { id: string; index: number; count: number } {
  const n = Math.max(1, pages.length);
  const index = Math.floor(now / 1000 / pageSec) % n;
  return { id: pages[index] ?? pages[0], index, count: n };
}
