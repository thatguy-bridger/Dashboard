// The tablet's own battery (navigator.getBattery, where the browser has it). Pure parts: reading it safely and choosing between it and Permuta's.
export type Bat = { pct: number; charging: boolean };
/** From a BatteryManager-like object (level 0..1). Null when the browser doesn't report one. */
export function fromManager(b: unknown): Bat | null {
  const o = b as { level?: unknown; charging?: unknown } | null;
  if (!o || typeof o.level !== "number" || !isFinite(o.level)) return null;
  return { pct: Math.min(100, Math.max(0, Math.round(o.level * 100))), charging: o.charging === true };
}
/** state:battery from Permuta is replaced by this page's own reading when it has one. Without either, nothing. */
export const batteryExtra = (local: Bat | null, extra: Record<string, unknown> | undefined): Record<string, unknown> => (local ? { ...(extra ?? {}), battery: local } : extra ?? {});
