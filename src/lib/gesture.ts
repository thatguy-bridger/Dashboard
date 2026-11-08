// The hidden settings trigger. Deliberately hard to hit by accident: hold the clock for three seconds, or tap the top-left corner five times quickly.
// Pure helpers so the timing can be tested.

export const HOLD_MS = 3000;
export const TAPS_NEEDED = 5;
export const TAP_WINDOW_MS = 2000;

/** 0 to 1: how far through the press-and-hold we are (drives the subtle progress ring). */
export const holdProgress = (startMs: number, nowMs: number, holdMs = HOLD_MS) => Math.min(1, Math.max(0, (nowMs - startMs) / holdMs));

/** Records a tap; fires when `need` taps land within `windowMs`. Older taps fall out of the window, and the count resets after firing. */
export function registerTap(taps: number[], now: number, o: { need?: number; windowMs?: number } = {}): { taps: number[]; fired: boolean } {
  const need = o.need ?? TAPS_NEEDED, windowMs = o.windowMs ?? TAP_WINDOW_MS;
  const kept = [...taps.filter((t) => now - t <= windowMs && now >= t), now];
  return kept.length >= need ? { taps: [], fired: true } : { taps: kept, fired: false };
}

/** Is a point in the top-left corner square (a fraction of the shorter screen side)? */
export function inCorner(x: number, y: number, w: number, h: number, frac = 0.12): boolean {
  const s = Math.min(w, h) * frac;
  return x >= 0 && y >= 0 && x <= s && y <= s;
}

/** A hold is cancelled if the finger/pointer wanders too far from where it started (so scrolling or dragging never counts). */
export const holdMoved = (x0: number, y0: number, x: number, y: number, slop = 24) => Math.hypot(x - x0, y - y0) > slop;
