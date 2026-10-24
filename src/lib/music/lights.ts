import sharp from "sharp";
import { d1Query } from "@/lib/d1";
import { analysePixels } from "@/lib/palette";
import { getProvider } from "@/lib/smarthome";
import { getGuestState } from "@/lib/smarthome/guest";
import { lightsInfo, speakerPicture, type LightInfo } from "@/lib/smarthome/homeAssistant";
import { positionNow, type LightsRun, type MusicState } from "@/lib/music/state";

/** The "Music lights" scene, run by the music brain. The whole song is planned ahead and handed to Home Assistant, which plays
 *  it on its own clock: a colour at the start of the song (brightening from the dim at the end of the last one), colour-only
 *  shifts along the way, a dip before the end, and the NEXT song's colours at the exact moment this one finishes. So the lights
 *  follow the music even with every screen asleep, and a song change doesn't wait for anyone to notice it. */

export type LightMode = "color" | "on" | "off";
export interface LightsCfg {
  enabled: boolean;
  /** lights chosen for the scene before per-light modes existed */
  ids: string[];
  /** per light: "color" follows the art (colour bulbs only), "on" is a plain white, "off" is off */
  modes: Record<string, LightMode>;
}
const EMPTY_CFG: LightsCfg = { enabled: false, ids: [], modes: {} };
const CFG_KEY = "musicLights";

let cfgCache: { at: number; cfg: LightsCfg } | null = null;
export async function loadLightsCfg(fresh = false): Promise<LightsCfg> {
  if (!fresh && cfgCache && Date.now() - cfgCache.at < 4000) return cfgCache.cfg;
  let cfg = EMPTY_CFG;
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [CFG_KEY]);
    const v = rows[0]?.value ? JSON.parse(rows[0].value) : null;
    if (v) cfg = { enabled: Boolean(v.enabled), ids: Array.isArray(v.ids) ? v.ids : [], modes: v.modes && typeof v.modes === "object" ? v.modes : {} };
  } catch { /* defaults */ }
  cfgCache = { at: Date.now(), cfg };
  return cfg;
}
export async function saveLightsCfg(cfg: LightsCfg) {
  cfgCache = { at: Date.now(), cfg };
  await d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [CFG_KEY, JSON.stringify(cfg)]);
}

// ---------- colours ----------

const paletteCache = new Map<string, { colors: string[]; mono: boolean }>();

/** Colours of a cover, worked out here (the same analysis the screens use for their accent). */
export async function artPalette(url: string): Promise<{ colors: string[]; mono: boolean } | null> {
  const hit = paletteCache.get(url);
  if (hit) return hit;
  try {
    let bytes: ArrayBuffer;
    if (url.startsWith("/api/music/art")) {
      // a cover that comes from a speaker: fetch it from Home Assistant
      const pic = await speakerPicture(new URL(url, "http://x").searchParams.get("e") ?? "");
      if (!pic) return null;
      bytes = pic.body;
    } else {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      bytes = await res.arrayBuffer();
    }
    const { data } = await sharp(Buffer.from(bytes)).resize(160, 160, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const p = analysePixels(data);
    const out = { colors: p.palette, mono: p.mono };
    paletteCache.set(url, out);
    if (paletteCache.size > 60) paletteCache.delete(paletteCache.keys().next().value!);
    return out;
  } catch {
    return null;
  }
}

/** These Tuya bulbs render some hues off: on the generic "Color Light" bulbs and bars a pure yellow (60 degrees) looks greenish,
 *  so yellows are pulled toward orange; the "100W Tune + Color" bulb needs only a little of that. Piecewise-linear. */
const HUE_FIX: Record<string, [number, number][]> = {
  "Color Light": [[0, 0], [20, 16], [40, 32], [60, 46], [80, 66], [120, 120], [360, 360]],
  "100W Tune + Color": [[0, 0], [40, 36], [60, 54], [80, 76], [360, 360]],
};
const calibrateHue = (model: string | undefined, h: number) => {
  const pts = model ? HUE_FIX[model] : undefined;
  if (!pts) return h;
  for (let i = 1; i < pts.length; i++) {
    if (h <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return Math.round(y0 + ((h - x0) / (x1 - x0)) * (y1 - y0)); }
  }
  return h;
};

const hexToHs = (hex: string): [number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round((h * 60 + 360) % 360), Math.round(max === 0 ? 0 : (d / max) * 100)];
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpHue = (a: number, b: number, t: number) => { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
const hueGap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

// ---------- planning ----------

export interface Bulb { id: string; name: string; supportsColor: boolean; supportsColorTemp: boolean; dimmable: boolean; model: string; on: boolean }
const toBulb = (l: LightInfo): Bulb => ({
  id: l.id, name: l.name, model: l.model, on: l.on,
  supportsColor: l.modes.some((m) => ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(m)),
  supportsColorTemp: l.modes.includes("color_temp"),
  dimmable: l.modes.some((m) => m !== "onoff"),
});

/** A light's job in the scene: what was chosen, else the Light Bars follow the art and everything else is off. */
export function modeOf(l: Pick<Bulb, "id" | "name" | "supportsColor">, cfg: LightsCfg): LightMode {
  const chosen = cfg.modes[l.id];
  if (chosen && (chosen !== "color" || l.supportsColor)) return chosen;
  const inScene = cfg.ids.length ? cfg.ids.includes(l.id) : /light bar/i.test(l.name) && l.supportsColor;
  return inScene ? (l.supportsColor ? "color" : "on") : "off";
}

interface Step { t: number; data?: Record<string, unknown>; off?: boolean }
export interface Look { colors: [number, number][]; mono: boolean }

const RAMP: [number, number][] = [[0, 25], [1667, 50], [3333, 75], [5000, 100]];
const NEXT_LEAD_MS = 450; // the command takes about half a second to reach the bulbs
const DIP_MS = 5500;
const NO_SHIFT_MS = 8000;

/** Steps that put a light into a song's look, starting at `t`. `ramp`: start dim and brighten over five seconds. */
function startSteps(l: Bulb, mode: LightMode, look: Look, ci: number, t: number, ramp: boolean, wasOn: boolean): Step[] {
  const bri = (extra: Record<string, unknown> = {}): Step[] => {
    if (!ramp || !l.dimmable) return [{ t, data: { ...extra, ...(l.dimmable ? { brightness_pct: 100 } : {}) } }];
    return RAMP.map(([dt, b], i) => ({ t: t + dt, data: { ...(i === 0 ? extra : {}), brightness_pct: b } }));
  };
  if (mode === "off") return wasOn ? [{ t, off: true }] : [];
  if (mode === "color" && l.supportsColor && !look.mono && look.colors.length) {
    const [h0, s0] = look.colors[ci % look.colors.length];
    const hs_color = [calibrateHue(l.model, h0), s0];
    if (!ramp || !l.dimmable) return [{ t, data: { hs_color } }];
    return RAMP.map(([dt, b], i) => ({ t: t + dt, data: { ...(i === 0 ? { hs_color } : {}), brightness_pct: b } }));
  }
  // "on": the same neutral white for every song (also what a colour light does for black-and-white art)
  if (l.supportsColorTemp) return bri({ color_temp_kelvin: 4000 });
  if (l.supportsColor) return bri({ hs_color: [0, 0] });
  return [{ t, data: {} }];
}

/** Everything one light does for the current song (from its start) and into the start of the next one. */
/** `live`: the length is unknown (radio, streams): the plan covers ten minutes of colour shifts and has no end-of-song dip or next-song switch. */
export function timeline(l: Bulb, mode: LightMode, ci: number, cur: Look, next: Look | null, durationMs: number, rampStart: boolean, live = false): Step[] {
  const steps: Step[] = [...startSteps(l, mode, cur, ci, 0, rampStart, l.on)];
  const colourful = mode === "color" && l.supportsColor && !cur.mono && cur.colors.length > 1;
  if (colourful) {
    // colour-only shifts at fixed points of the song: every tenth of its length, never closer than 15 seconds, none in the last 8 seconds
    const every = Math.max(15_000, durationMs / 10);
    let prevHue = calibrateHue(l.model, cur.colors[ci % cur.colors.length][0]);
    for (let k = 1; k * every <= durationMs - NO_SHIFT_MS; k++) {
      const [h, s] = cur.colors[(ci + k) % cur.colors.length];
      const target = calibrateHue(l.model, h);
      const t = Math.round(k * every);
      if (hueGap(prevHue, target) > 50) steps.push({ t, data: { hs_color: [target, s] } }); // a big jump would sweep through other hues: just switch
      else for (let j = 0; j < 4; j++) steps.push({ t: t + 3000 * (j + 1), data: { hs_color: [Math.round(lerpHue(prevHue, target, (j + 1) / 4)), s] } });
      prevHue = target;
    }
  }
  if (!live && mode !== "off" && l.dimmable) for (let k = 0; k < 3; k++) steps.push({ t: durationMs - DIP_MS + Math.round(((k + 1) * 5000) / 3), data: { brightness_pct: Math.round(lerp(100, 25, (k + 1) / 3)) } });
  if (next && !live) {
    const tN = durationMs - NEXT_LEAD_MS;
    const kept = steps.filter((s) => s.t < tN);
    steps.length = 0;
    steps.push(...kept, ...startSteps(l, mode, next, ci, tN, true, false));
  }
  return steps.sort((a, b) => a.t - b.t);
}

/** Folds every step up to `pos` into one catch-up step at `pos` (so a plan made mid-song starts from the right look), and
 *  turns the rest into frames with the pause after each. */
export function frames(steps: Step[], pos: number): { frames: { data?: Record<string, unknown>; off?: boolean; wait: number }[]; startIn: number } | null {
  const past = steps.filter((s) => s.t <= pos);
  const future = steps.filter((s) => s.t > pos);
  const list: Step[] = [];
  if (past.length) {
    const data: Record<string, unknown> = {};
    let off = false;
    for (const s of past) { if (s.off) { off = true; continue; } off = false; Object.assign(data, s.data); }
    list.push(off ? { t: pos, off: true } : { t: pos, data });
  }
  list.push(...future);
  if (!list.length) return null;
  return {
    startIn: Math.max(0, (list[0].t - pos) / 1000),
    frames: list.map((s, i) => ({ ...(s.off ? { off: true } : { data: s.data ?? {} }), wait: i + 1 < list.length ? Math.max(0, (list[i + 1].t - s.t) / 1000) : 0 })),
  };
}

/** Covers with no colour of their own (black and white) still get a colour, never a white: white lights are far brighter than colours on
 *  these bulbs. The colour is picked from the song, so the same song always looks the same and different songs differ. */
const FALLBACK_HUES = [350, 25, 200, 270, 160];
function fallbackColor(seed: string): [number, number] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [FALLBACK_HUES[h % FALLBACK_HUES.length], 70];
}
const toLook = (colors: string[], mono: boolean, seed: string): Look =>
  mono || !colors.length ? { colors: [fallbackColor(seed)], mono: false } : { colors: colors.map(hexToHs), mono: false };

async function stopAll(ids: string[]) {
  const p = getProvider();
  await Promise.all(ids.map((id) => p.stopFade?.(id).catch(() => {})));
}

/** Plain white at full brightness for the given lights (neutral 4000K where a bulb has a white temperature). */
export async function resetToWhite(onlyIds?: string[]) {
  const p = getProvider();
  const all = (await lightsInfo()).filter((l) => l.available && l.on).map(toBulb).filter((l) => !onlyIds || onlyIds.includes(l.id));
  await stopAll(all.map((l) => l.id));
  const group = (f: (l: Bulb) => boolean) => all.filter(f).map((l) => l.id);
  const ct = group((l) => l.supportsColorTemp), colourOnly = group((l) => !l.supportsColorTemp && l.supportsColor), plain = group((l) => !l.supportsColorTemp && !l.supportsColor);
  const dim = group((l) => l.dimmable);
  await Promise.all([
    ct.length ? p.actMany?.(ct, { type: "colorTemp", value: 4000 }) : null,
    colourOnly.length ? p.actMany?.(colourOnly, { type: "color", h: 0, s: 0 }) : null,
    plain.length ? p.actMany?.(plain, { type: "on" }) : null,
  ]);
  if (dim.length) await p.actMany?.(dim, { type: "brightness", value: 100 });
}

/** Called after every music update: makes sure the lights are running a plan that matches the song, where it is, and what is next.
 *  Returns the bookkeeping to store with the music state. */
export async function syncLights(state: MusicState, cfg: LightsCfg, now = Date.now()): Promise<LightsRun | null> {
  const run = state.lights;
  try {
    const guest = (await getGuestState().catch(() => ({ active: false }))).active;
    if (!cfg.enabled || guest) {
      if (run) {
        await stopAll(run.ids);
        // switched off while the lights were following the music: back to plain white, but only the lights that are on
        // (after "It's the night" they are all off and must stay off)
        if (!cfg.enabled && !guest) await resetToWhite();
      }
      return null;
    }
    const track = state.track;
    if (!state.isPlaying || !track) {
      // paused: the lights stay as they are, but nothing may keep stepping on its own
      if (run?.active) { await stopAll(run.ids); return { ...run, active: false }; }
      return run;
    }
    const cur = state.palette && state.palette.trackId === track.id ? state.palette : null;
    if (!cur) return run; // this song's cover isn't analysed yet (the next update plans it)
    const nextTrack = state.next[0];
    const nextLook = nextTrack?.palette ? toLook(nextTrack.palette, Boolean(nextTrack.mono), nextTrack.id) : null;
    const pos = positionNow(state, now);
    const live = track.durationMs <= 0;
    const key = `${live ? Math.floor(pos / (8 * 60_000)) : ""}|${track.id}|${JSON.stringify(cfg.modes)}|${cfg.ids.join(",")}|${nextTrack?.id ?? ""}:${nextLook ? "p" : ""}`;
    const expected = run ? run.pos0 + (now - run.at) : 0;
    const drifted = run?.active && run.trackId === track.id && Math.abs(pos - expected) > 3500;
    if (run?.active && run.trackId === track.id && run.key === key && !drifted) return run;

    const bulbs = (await lightsInfo()).filter((l) => l.available).map(toBulb);
    const rampStart = Boolean(run?.active) && run!.trackId !== track.id;
    const look = toLook(cur.colors, cur.mono, track.id);
    const p = getProvider();
    let ci = 0;
    const ids: string[] = [];
    await Promise.all(bulbs.map((l) => {
      const mode = modeOf(l, cfg);
      const idx = mode === "color" && l.supportsColor ? ci++ : 0;
      const plan = frames(timeline(l, mode, idx, look, nextLook, live ? 10 * 60_000 : track.durationMs, rampStart, live), pos);
      if (!plan) return null;
      ids.push(l.id);
      return (p.fade ? p.fade(l.id, plan.frames, plan.startIn) : Promise.resolve()).catch(() => {});
    }));
    // lights that are no longer part of the plan must not keep running an old one
    if (run?.ids.length) await stopAll(run.ids.filter((id) => !ids.includes(id)));
    return { trackId: track.id, key, active: true, pos0: pos, at: now, ids };
  } catch {
    return run;
  }
}
