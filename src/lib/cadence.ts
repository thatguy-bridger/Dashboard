// How often the screen asks the server for things.
// Every request is a function run on the host, so the cost follows the clock: a screen nobody is touching, a hidden tab and the middle of the night all ask far less often,
// and asking comes back at full speed the moment someone touches the screen or the tab is shown again.

let lastInput = typeof Date !== "undefined" ? Date.now() : 0;
const listeners: (() => void)[] = [];

if (typeof window !== "undefined") {
  const mark = () => { lastInput = Date.now(); };
  for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"]) window.addEventListener(ev, mark, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { lastInput = Date.now(); listeners.forEach((f) => f()); } });
}

/** Milliseconds since anyone last touched the screen. */
export const idleFor = () => Date.now() - lastInput;
/** Late night, when nobody is looking. */
export const isNight = (d = new Date()) => d.getHours() >= 23 || d.getHours() < 6;
export const hidden = () => typeof document !== "undefined" && document.hidden;

/**
 * Runs `fn` repeatedly, asking `every()` how long to wait before each next run (so the pace can follow what is on screen).
 * It never runs while the tab is hidden, and runs once straight away when the tab is shown again.
 */
export function poll(fn: () => void, every: () => number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const loop = () => {
    if (stopped) return;
    if (!hidden()) fn();
    t = setTimeout(loop, Math.max(1000, every()));
  };
  const wake = () => { if (stopped) return; if (t) clearTimeout(t); loop(); };
  listeners.push(wake);
  t = setTimeout(loop, Math.max(1000, every()));
  return () => { stopped = true; if (t) clearTimeout(t); const i = listeners.indexOf(wake); if (i >= 0) listeners.splice(i, 1); };
}

// ----- who is there? -----
// Hands-on: someone touched the screen a moment ago. Lights on (or music playing): somebody is up. Lights off: away or asleep, and the longer that lasts the slower it all gets.
// A tiny check (/api/watch) keeps an eye on the lights while it is slow, and the moment they come on everything speeds up at once.

type Presence = { lit: boolean; known: boolean };
let presence: Presence = { lit: true, known: false };
let unlitSince = 0;

/** What the lights say (in this screen's room if it has one, else anywhere in the house). Coming on wakes every poll at once. */
export function setLights(count: number) {
  const lit = count > 0;
  const wasLit = presence.lit || !presence.known;
  presence = { lit, known: true };
  if (!lit && wasLit) unlitSince = Date.now();
  if (lit && !wasLit) listeners.forEach((f) => f());
}

/** 0 hands-on · 1 lights on or music · 2 away (lights off) · 3 away a long while or asleep. While the lights aren't known (yet), nobody is assumed gone. */
export function tier(playing = false, now = Date.now()): 0 | 1 | 2 | 3 {
  if (idleFor() < 120_000) return 0;
  if (!presence.known || presence.lit || playing) return 1;
  return now - unlitSince > 45 * 60_000 || isNight(new Date(now)) ? 3 : 2;
}

const SEC = 1000, MIN = 60_000;
/** The pause between screen-data requests. */
export const screenEvery = (playing: boolean) => [5 * SEC, 10 * SEC, 3 * MIN, 10 * MIN][tier(playing)];
/** The pause between Home requests: quick only while the Home page is on screen and being used. */
export const homeEvery = (onHomePage: boolean, playing = false) => { const t = tier(playing); return [onHomePage ? 3 * SEC : 20 * SEC, onHomePage ? 15 * SEC : 30 * SEC, 5 * MIN, 15 * MIN][t]; };
/** The pause between "this screen is alive" pings. */
export const pingEvery = (playing = false) => [20 * SEC, 30 * SEC, 5 * MIN, 15 * MIN][tier(playing)];
/** How often the lights are checked while the screen is slow (and, when it isn't, how often to see whether it has become slow). */
export const watchEvery = (playing = false) => { const t = tier(playing); return t === 2 ? 45 * SEC : t === 3 ? 90 * SEC : 60 * SEC; };
export const watching = (playing = false) => tier(playing) >= 2;

/** Lights on in a room, or anywhere when no room is given. */
export function lightsOn(devices: { kind: string; on: boolean; room: string }[], room = ""): number {
  const r = room.trim().toLowerCase();
  return devices.filter((d) => d.kind === "light" && d.on && (!r || d.room.toLowerCase() === r)).length;
}
