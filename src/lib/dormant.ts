/** "Dormant": nobody is using the screen (no touch for a few minutes and nobody in front of it) or it's hidden/off, so nothing may ask
 *  the server for anything. Set by useCalmMode (lib/useCalm.ts); read by pollEvery and the music poller. Any touch, someone arriving,
 *  or the screen coming back on wakes everything and every poller catches up at once. */
let flag = false;
const wakers = new Set<() => void>();

export const isDormant = () => flag || (typeof document !== "undefined" && document.hidden);

export function setDormant(v: boolean) {
  if (v === flag) return;
  flag = v;
  if (!v) wakers.forEach((fn) => fn());
}

/** Called when the screen wakes from dormant (and not on every touch). */
export function onWake(fn: () => void): () => void {
  wakers.add(fn);
  return () => { wakers.delete(fn); };
}

/** How long nobody has been in front of the tablet (from its motion sensor, via usePresenceDim); null when unknown or stale. */
let presence: { idleMs: number; at: number } | null = null;
export function setPresence(idleMs: number | null) { presence = idleMs == null ? null : { idleMs, at: Date.now() }; }
export function presenceIdleMs(): number | null {
  if (!presence || Date.now() - presence.at > 120_000) return null;
  return presence.idleMs + (Date.now() - presence.at);
}
