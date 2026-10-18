/** "Dormant": nobody is using the screen (no touch for a few minutes) or it's hidden/off, so nothing may ask the server for
 *  anything. Set by useCalmMode (lib/useCalm.ts); read by pollEvery and the music poller. Any touch, or the screen coming
 *  back on, wakes everything and every poller catches up at once. */
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
