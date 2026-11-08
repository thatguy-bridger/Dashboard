// Guest mode: a screen set to `guest` shows only the lights switch and the fan, and nothing else can be reached until the PIN is entered
// (which lifts guest mode for four hours). The page asks this file before it does anything a guest must not be able to do. Pure.
export const GUEST_EXIT_MS = 4 * 3600 * 1000;
export type GuestAction = "lights" | "fan" | "pin" | "settings" | "navigate" | "island" | "welcome" | "scene";

/** Guest mode is on when the config says so and the PIN exemption (until, epoch ms) has run out. */
export const guestActive = (cfg: { guest?: boolean }, exemptUntil: number, now: number) => cfg.guest === true && now >= exemptUntil;
export const exemptFrom = (now: number) => now + GUEST_EXIT_MS;
const ALLOWED: GuestAction[] = ["lights", "fan", "pin"];
/** While guest mode is on, only the lights, the fan and the PIN entry are allowed; every other action (settings, pages, island, rail) is refused. */
export const guestAllows = (active: boolean, a: GuestAction) => !active || ALLOWED.includes(a);
/** What the hidden trigger does: in guest mode it only ever asks for the PIN (and a correct one ends guest mode instead of opening settings). */
export const triggerOutcome = (active: boolean, locked: boolean): "pin-exit" | "pin-settings" | "settings" => (active ? "pin-exit" : locked ? "pin-settings" : "settings");

type Dev = { id: string; kind: string; name: string; on: boolean; percentage?: number; speedCount?: number };
export type GuestFan = { id: string; name: string; step: number; steps: number };
export type GuestPlan = { lightIds: string[]; lightsOn: boolean; fans: GuestFan[] };
/** The lights switch (every light and plug) and each fan with its current step. */
export function guestPlan(devices: Dev[]): GuestPlan {
  const lights = devices.filter((d) => d.kind === "light" || d.kind === "plug");
  const fans = devices.filter((d) => d.kind === "fan").map((d) => { const n = Math.max(1, d.speedCount ?? 1); return { id: d.id, name: d.name, steps: n, step: d.on ? Math.max(1, Math.round((d.percentage ?? 1) * n)) : 0 }; });
  return { lightIds: lights.map((l) => l.id), lightsOn: lights.some((l) => l.on), fans };
}
/** The request for the big switch: all off if any is on, otherwise all on. */
export const lightsRequest = (p: GuestPlan) => ({ op: "many", ids: p.lightIds, on: !p.lightsOn });
export const fanRequest = (f: GuestFan, step: number) => ({ op: "fan", id: f.id, pct: Math.round((step / f.steps) * 100) });
