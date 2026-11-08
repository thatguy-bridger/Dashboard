import { num, obj, str, type InfoSource, type SourceCtx } from "./types.ts";

// state:car = { "fuelPct": 62, "batteryPct": null, "rangeMi": 240, "charging": false, "locked": true, "parkedAt": "Home", "lastDrive": { "miles": 11.2, "minutes": 24, "at": epochSeconds } }
export type Car = { fuelPct?: number; batteryPct?: number; rangeMi?: number; charging: boolean; locked?: boolean; parkedAt?: string; lastDrive?: { miles: number; minutes: number; at?: number } };
export function parseCar(raw: unknown): Car | null {
  const o = obj(raw); if (!o) return null;
  const d = obj(o.lastDrive);
  return { fuelPct: num(o.fuelPct), batteryPct: num(o.batteryPct), rangeMi: num(o.rangeMi), charging: o.charging === true, locked: typeof o.locked === "boolean" ? o.locked : undefined, parkedAt: str(o.parkedAt),
    lastDrive: d && num(d.miles) != null && num(d.minutes) != null ? { miles: num(d.miles)!, minutes: num(d.minutes)!, at: num(d.at) } : undefined };
}
const carOf = (c: SourceCtx) => parseCar(c.extra.car);
const low = (car: Car) => (car.fuelPct != null && car.fuelPct <= 15) || (car.batteryPct != null && car.batteryPct <= 20 && !car.charging);

export const car: InfoSource = {
  id: "car",
  items: (c) => {
    const x = carOf(c); if (!x) return [];
    const out = [];
    if (low(x)) out.push({ id: "car-low", zone: "pill" as const, title: x.fuelPct != null && x.fuelPct <= 15 ? `Car fuel ${Math.round(x.fuelPct)}%` : `Car battery ${Math.round(x.batteryPct ?? 0)}%`, icon: "car", priority: 75 });
    if (x.locked === false) out.push({ id: "car-unlocked", zone: "peek" as const, title: "Car is unlocked", icon: "car", priority: 50 });
    return out;
  },
  score: (c) => { const x = carOf(c); return x && low(x) ? 65 : 0; },
};
