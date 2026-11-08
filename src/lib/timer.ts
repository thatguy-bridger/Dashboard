// "Switch off after …": timers run in Home Assistant (script.permuta_timer, installed by Permuta; mode parallel), so they survive this page closing.
// This file is the pure part: the request the server sends, and the page's own record of the timers it started (so a tile can show "off at 10:45").
export const TIMER_SCRIPT = "script.permuta_timer";
export const TIMER_CHOICES = [{ minutes: 15, label: "15 min" }, { minutes: 30, label: "30 min" }, { minutes: 60, label: "1 h" }, { minutes: 120, label: "2 h" }] as const;
export const MAX_TIMER_MIN = 720;
const ENTITY = /^(light|fan|switch)\.[a-z0-9_]{1,60}$/;

export type HaCall = { domain: string; service: string; data: Record<string, unknown> };
/** One script call per entity (the script takes a single `entity`). Nothing at all if the minutes or an id aren't sane. */
export function timerCalls(b: { id?: unknown; ids?: unknown; minutes?: unknown; on?: unknown }): HaCall[] {
  const m = typeof b.minutes === "number" && isFinite(b.minutes) ? Math.round(b.minutes) : 0;
  if (m < 1 || m > MAX_TIMER_MIN) return [];
  const raw = Array.isArray(b.ids) ? b.ids : b.id !== undefined ? [b.id] : [];
  const ids = [...new Set(raw.filter((x): x is string => typeof x === "string" && ENTITY.test(x)))].slice(0, 40);
  return ids.map((entity) => ({ domain: "script", service: "turn_on", data: { entity_id: TIMER_SCRIPT, variables: { entity, minutes: m, on: b.on === true } } }));
}
/** Stops every running timer (the script is in parallel mode, so turning it off ends all of its runs). */
export const cancelCall = (): HaCall => ({ domain: "script", service: "turn_off", data: { entity_id: TIMER_SCRIPT } });

// ----- what this page started: entity id -> when it fires and what it does -----
export type Timers = Record<string, { at: number; on: boolean }>;
export const startTimers = (t: Timers, ids: string[], minutes: number, on: boolean, now: number): Timers => {
  const next = { ...t }; for (const id of ids) next[id] = { at: now + minutes * 60000, on }; return next;
};
export const liveTimers = (t: Timers, now: number): Timers => Object.fromEntries(Object.entries(t).filter(([, v]) => v.at > now));
/** The earliest running timer among these ids, if any. */
export function timerOf(t: Timers, ids: string[], now: number): { at: number; on: boolean } | null {
  let best: { at: number; on: boolean } | null = null;
  for (const id of ids) { const v = t[id]; if (v && v.at > now && (!best || v.at < best.at)) best = v; }
  return best;
}
/** Cancelling stops them all in Home Assistant, so the ones that should keep running are started again with what is left of them (rounded up to a whole minute). */
export function cancelPlan(t: Timers, ids: string[], now: number): { timers: Timers; rearm: { id: string; minutes: number; on: boolean }[] } {
  const live = liveTimers(t, now), keep: Timers = {}, rearm: { id: string; minutes: number; on: boolean }[] = [];
  for (const [id, v] of Object.entries(live)) if (!ids.includes(id)) { keep[id] = v; rearm.push({ id, minutes: Math.max(1, Math.ceil((v.at - now) / 60000)), on: v.on }); }
  return { timers: keep, rearm };
}
