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

/** The pause between screen-data requests: quick while music plays (track changes matter) or someone is using it, slow otherwise, slowest at night. */
export const screenEvery = (playing: boolean) => (isNight() ? 120_000 : playing ? 20_000 : idleFor() < 120_000 ? 20_000 : 60_000);
/** The pause between Home requests: fast only while the Home page is on screen and being used. */
export const homeEvery = (onHomePage: boolean) => (isNight() ? 180_000 : onHomePage && idleFor() < 120_000 ? 5_000 : onHomePage ? 30_000 : 90_000);
/** The pause between "this screen is alive" pings. */
export const pingEvery = () => (isNight() ? 300_000 : idleFor() < 120_000 ? 60_000 : 180_000);
