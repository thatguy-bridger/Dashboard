// A few seconds of memory on the server, so several screens asking at once cost one trip to the database or Home Assistant.
const mem = new Map<string, { at: number; p: Promise<unknown> }>();

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = fn();
  mem.set(key, { at: Date.now(), p });
  p.catch(() => { if (mem.get(key)?.p === p) mem.delete(key); });          // a failure is never remembered
  if (mem.size > 200) { const old = [...mem.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100); for (const [k] of old) mem.delete(k); }
  return p;
}
export const forget = (prefix: string) => { for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k); };
