// The scene selector: a pure function from "what's going on" to "what the display should show".
// No React, no I/O, no imports, so it can be unit-tested (node --test src/lib/scenes.test.ts) and reused by any visual layer.

export type SceneId = "idle" | "music" | "soon" | "day" | "morning" | "night" | "away" | "offline";
export const SCENE_IDS: SceneId[] = ["idle", "music", "soon", "day", "morning", "night", "away", "offline"];

export type Ev = { title: string; start: number; end: number; allDay?: boolean; color?: string; location?: string; tier?: number; kind?: string };   // start/end: epoch seconds
export type MusicState = { playing: boolean; track?: string; at?: number };                                                          // at: epoch ms of the position sample

/** The scene-related part of config:screen, written by Permuta. Unknown fields are ignored; bad values fall back to the defaults. */
export type SceneConfig = {
  order?: SceneId[];          // highest priority first; scenes left out of the list are never chosen except idle (the fallback)
  disabled?: SceneId[];
  soonLeadMin?: number;       // a timed event takes over this many minutes before it starts
  soonStayMin?: number;       // …and stays this long after it starts ("now")
  soonMinTier?: number;       // events below this tier (0 background, 1 normal, 2 important, 3 critical) never take over
  dayMinEvents?: number;      // a day with at least this many timed events left shows the timeline
  dayKinds?: string[];        // …or any day with an event of these kinds (school, church…)
  nightStart?: number;        // hour of day, 0–23
  nightEnd?: number;
  morningStart?: number;
  morningEnd?: number;
  musicHoldSec?: number;      // the music scene stays this long after playback pauses
  staleSec?: number;          // Permuta counts as offline when its last update is older than this
  minDwellSec?: number;       // a scene is kept at least this long before switching to another non-urgent one
};

export const DEFAULTS: Required<SceneConfig> = {
  order: ["offline", "soon", "away", "music", "night", "day", "morning", "idle"],
  disabled: [],
  soonLeadMin: 15, soonStayMin: 5, soonMinTier: 1, dayMinEvents: 3, dayKinds: ["school", "church"],
  nightStart: 22, nightEnd: 6, morningStart: 6, morningEnd: 9,
  musicHoldSec: 90, staleSec: 180, minDwellSec: 6,
};

export type SceneInput = {
  now: number;                // epoch ms
  events: Ev[];
  music: MusicState | null;
  away: boolean;
  statusAt: number | null;    // when Permuta last said anything, epoch seconds
  apiOk: boolean;             // the last request to our own server worked
  hasData: boolean;           // at least one successful load so far
  musicLights?: boolean;      // the music lights are on: the Music page takes priority, even if nothing is playing yet
  config?: SceneConfig | null;
};

export type Decision = {
  scene: SceneId;
  reason: string;
  dim: number;                // 0 normal … 1 black (night)
  focus?: Ev;                 // the event a "soon" scene is about
  applies: SceneId[];         // every scene that applies right now, in priority order
  urgent: boolean;            // skip the minimum dwell time
  stale?: string;             // set when Permuta (or the server) has gone quiet: the page keeps working from what it last received
};

const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function resolveConfig(c?: SceneConfig | null): Required<SceneConfig> {
  const o = c ?? {};
  const list = (v: unknown, d: SceneId[]) => (Array.isArray(v) ? v.filter((x): x is SceneId => SCENE_IDS.includes(x as SceneId)) : d);
  return {
    order: list(o.order, DEFAULTS.order), disabled: list(o.disabled, DEFAULTS.disabled),
    dayMinEvents: num(o.dayMinEvents, DEFAULTS.dayMinEvents, 1, 20), dayKinds: Array.isArray(o.dayKinds) ? o.dayKinds.filter((x): x is string => typeof x === "string") : DEFAULTS.dayKinds,
    soonLeadMin: num(o.soonLeadMin, DEFAULTS.soonLeadMin, 1, 180), soonStayMin: num(o.soonStayMin, DEFAULTS.soonStayMin, 0, 60), soonMinTier: num(o.soonMinTier, DEFAULTS.soonMinTier, 0, 3),
    nightStart: num(o.nightStart, DEFAULTS.nightStart, 0, 23), nightEnd: num(o.nightEnd, DEFAULTS.nightEnd, 0, 23),
    morningStart: num(o.morningStart, DEFAULTS.morningStart, 0, 23), morningEnd: num(o.morningEnd, DEFAULTS.morningEnd, 0, 23),
    musicHoldSec: num(o.musicHoldSec, DEFAULTS.musicHoldSec, 0, 3600), staleSec: num(o.staleSec, DEFAULTS.staleSec, 30, 86400), minDwellSec: num(o.minDwellSec, DEFAULTS.minDwellSec, 0, 600),
  };
}

/** Hour window that may wrap past midnight (22 → 6). Equal start and end means "never". */
export function inWindow(hour: number, start: number, end: number) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** The timed, important-enough event that should take over now (or null). */
export function soonEvent(events: Ev[], now: number, c: Required<SceneConfig>): Ev | null {
  let best: Ev | null = null;
  for (const e of events) {
    if (e.allDay || (e.tier ?? 1) < c.soonMinTier) continue;
    const toStart = e.start * 1000 - now;
    if (toStart > c.soonLeadMin * 60000 || toStart < -c.soonStayMin * 60000) continue;
    if (e.end * 1000 <= now) continue;
    if (!best || e.start < best.start) best = e;
  }
  return best;
}

/** A busy day: enough timed events still to come today, or one of a kind that always gets the timeline (school, church). */
export function busyDay(events: Ev[], now: number, c: Required<SceneConfig>): boolean {
  const d = new Date(now), endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const left = events.filter((e) => !e.allDay && e.end * 1000 > now && e.start * 1000 < endOfDay && (e.tier ?? 1) >= 1);
  return left.length >= c.dayMinEvents || left.some((e) => e.kind != null && c.dayKinds.includes(e.kind));
}

export function decide(input: SceneInput, prev?: SceneId | null): Decision {
  const c = resolveConfig(input.config);
  const d = new Date(input.now);
  const hour = d.getHours();
  const ok = (s: SceneId) => !c.disabled.includes(s);
  const reasons: Partial<Record<SceneId, string>> = {};
  let focus: Ev | undefined;

  // offline: our server can't be reached, or Permuta has gone quiet (hysteresis: it must be fresh again by half the limit)
  const age = input.statusAt == null ? Infinity : input.now / 1000 - input.statusAt;
  const limit = c.staleSec;
  // The page never goes dark for this: it keeps showing the schedule, weather and the rest from the last update, with a quiet note.
  let stale: string | undefined;
  if (input.hasData && !input.apiOk) stale = "the server isn't answering";
  else if (input.hasData && age > limit) stale = input.statusAt == null ? "Permuta hasn't reported yet" : `Permuta was last heard ${age >= 3600 ? Math.round(age / 3600) + " h" : Math.round(age / 60) + " min"} ago`;

  const s = soonEvent(input.events, input.now, c);
  if (s) { focus = s; const m = Math.round((s.start * 1000 - input.now) / 60000); reasons.soon = `“${s.title}” ${m > 0 ? `starts in ${m} min` : "is starting"}`; }

  if (input.away) reasons.away = "marked away";

  const m = input.music;
  if (m && m.track && !stale) {          // a stale music state must not be believed
    if (m.playing) reasons.music = "music is playing";
    else if (m.at != null && input.now - m.at < c.musicHoldSec * 1000) reasons.music = "music paused a moment ago";
  }
  if (input.musicLights && !stale && reasons.music === undefined) reasons.music = "music lights are on";

  const night = inWindow(hour, c.nightStart, c.nightEnd);
  if (night) reasons.night = `night hours (${c.nightStart}:00–${c.nightEnd}:00)`;
  if (!night && inWindow(hour, c.morningStart, c.morningEnd)) reasons.morning = `morning (${c.morningStart}:00–${c.morningEnd}:00)`;
  if (busyDay(input.events, input.now, c)) reasons.day = "a busy day: the timeline";
  reasons.idle = "nothing else applies";

  const applies = c.order.filter((x) => ok(x) && reasons[x] !== undefined);
  if (!applies.includes("idle")) applies.push("idle");
  const scene = applies[0];
  // music/soon/away at night keep their own look but dimmed; the night scene itself is the darkest
  const dim = scene === "night" ? 0.7 : night && scene !== "soon" ? 0.55 : 0;
  return { scene, reason: reasons[scene] ?? "default", dim, focus: scene === "soon" ? focus : undefined, applies, urgent: scene === "soon", stale };
}

/** Never flicker: keep the current scene for at least minDwellSec unless it stopped applying or the new one is urgent. */
export type SceneState = { scene: SceneId; since: number };
export function settle(prev: SceneState | null, d: Decision, now: number, minDwellSec: number): SceneState {
  if (!prev) return { scene: d.scene, since: now };
  if (prev.scene === d.scene) return prev;
  const stillApplies = d.applies.includes(prev.scene);
  const dwelled = now - prev.since >= minDwellSec * 1000;
  if (!stillApplies || dwelled || d.urgent) return { scene: d.scene, since: now };
  return prev;
}
