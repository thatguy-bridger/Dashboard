import { num, obj, type InfoSource, type SourceCtx } from "./types.ts";

// state:battery = { "pct": 0..100, "charging": false }   (the tablet this page runs on, or any device Permuta reports)
export function parseBattery(raw: unknown): { pct: number; charging: boolean } | null {
  const o = obj(raw); const p = num(o?.pct);
  return o && p != null ? { pct: Math.min(100, Math.max(0, p)), charging: o.charging === true } : null;
}
const batOf = (c: SourceCtx) => parseBattery(c.extra.battery);

export const battery: InfoSource = {
  id: "battery",
  items: (c) => { const b = batOf(c); return b && b.pct <= 20 && !b.charging ? [{ id: "battery-low", zone: "pill", title: `Tablet battery ${Math.round(b.pct)}%`, icon: "battery", priority: 70 }] : []; },
  score: (c) => { const b = batOf(c); return b && b.pct <= 20 && !b.charging ? 55 : 0; },
};
