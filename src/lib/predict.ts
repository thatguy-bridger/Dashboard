// The prediction layer: the page must not wait for reports that have probably already happened in real life. Everything here is pure.
//  - Music: when the extrapolated position passes the song's length, roll over to the next song (if the server told us what it is) or hold at the end.
//    A later report reconciles: the same song keeps going with only a gentle position correction; a different song is switched to at once.
//  - Controls: apply the user's action optimistically and immediately; the override is dropped when a report confirms it, when the request fails,
//    or after ~6 s if the reports still disagree.
//  - Events: anything whose end has passed drops out on its own.
//  - Clock-based text (countdowns, "in 2h") is derived from the clock elsewhere, never from the last report.
import type { Ev, Music, NextTrack } from "./types.ts";
import type { Home } from "./ha.ts";

// ---------- music ----------

export type PredMusic = Music & { predicted?: boolean; ended?: boolean; lyricsId?: string };

/** Where in the song we are: the last measurement, extended by the clock while playing. */
export const positionOf = (m: Pick<Music, "playing" | "progress" | "at">, nowMs: number) => m.progress + (m.playing ? Math.max(0, nowMs - m.at) / 1000 : 0);

/** The music to show now. A song that has run past its end is replaced by the next one (position counted from the predicted end moment), or held at its end. */
export function predictMusic(m: Music | null, nowMs: number): PredMusic | null {
  if (!m) return null;
  if (!m.playing || !(m.duration > 0) || positionOf(m, nowMs) < m.duration) return m;
  const endMoment = m.at + (m.duration - m.progress) * 1000;
  const n: NextTrack | undefined = m.next;
  if (n && n.track && (n.duration ?? 0) > 0) {
    const nextPos = (nowMs - endMoment) / 1000;
    const base: PredMusic = { playing: true, trackId: n.id, track: n.track, artist: n.artist ?? "", art: n.art, palette: n.palette, lyricsId: n.lyricsId, duration: n.duration!, progress: 0, at: endMoment, device: m.device, volume: m.volume, predicted: true };
    return nextPos >= n.duration! ? { ...base, playing: false, ended: true, progress: n.duration!, at: nowMs } : base;      // the next one is over too (nothing beyond it is known): hold at its end
  }
  return { ...m, playing: false, ended: true, predicted: true, progress: m.duration, at: nowMs };                           // nothing known after it: hold at the end instead of 3:37 / 3:37 for ever
}

/** The position that's actually shown: it keeps time with the clock, and a correction (a new report) is folded in at most `rate` of real time (25 %); a big difference is a seek and jumps. */
export function blendPosition(shown: number, target: number, dtSec: number, o: { rate?: number; jump?: number } = {}): number {
  const rate = o.rate ?? 0.25, jump = o.jump ?? 3;
  const advanced = shown + dtSec;
  const diff = target - advanced;
  if (Math.abs(diff) > jump) return target;
  const corr = Math.max(-rate * dtSec, Math.min(rate * dtSec, diff));
  return advanced + corr;
}

/** Lyrics for the song being shown: this song's rows, or the next song's if that is what we have rolled over to. */
export function pickLyrics<T extends { id: string }>(trackId: string | undefined, current: T | null | undefined, next: T | null | undefined): T | null {
  if (!trackId) return null;
  if (current && current.id === trackId) return current;
  if (next && next.id === trackId) return next;
  return null;
}

// ---------- events ----------

/** Events that haven't finished yet, soonest first. A passed event never lingers. */
export const liveEvents = (events: Ev[], nowMs: number) => events.filter((e) => e.end * 1000 > nowMs).sort((a, b) => a.start - b.start);

// ---------- optimistic controls ----------

export type Opt = Record<string, { value: unknown; at: number }>;
export const OPT_TTL_MS = 6000;

export const setOpt = (map: Opt, patch: Record<string, unknown>, now: number): Opt => { const out = { ...map }; for (const [k, v] of Object.entries(patch)) out[k] = { value: v, at: now }; return out; };
export const failOpt = (map: Opt, keys: string[]): Opt => { const out = { ...map }; for (const k of keys) delete out[k]; return out; };
const same = (a: unknown, b: unknown): boolean => {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < (Math.abs(a) > 50 || Math.abs(b) > 50 ? 3 : 0.04);          // 0-1 levels vs. hue/saturation/kelvin numbers
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  return a === b;
};

/** Drops overrides that a report has confirmed, or that have outlived the grace period while the reports still disagree (then the report wins: the revert). */
export function resolveOpt(map: Opt, reported: Record<string, unknown>, now: number, ttlMs = OPT_TTL_MS): Opt {
  let changed = false; const out: Opt = {};
  for (const [k, o] of Object.entries(map)) {
    const confirmed = k in reported && same(reported[k], o.value), expired = now - o.at >= ttlMs;
    if (confirmed || expired) changed = true; else out[k] = o;
  }
  return changed ? out : map;
}

type Body = { op?: string; id?: string; ids?: string[]; on?: boolean; pct?: number; k?: number; h?: number; s?: number; level?: number; action?: string; name?: string; cmd?: { type?: string; action?: string; level?: number } };
/** What a control press means for the state we show, derived from the /api/act body (so every button gets the same treatment). */
export function overridesFor(body: Body, home?: Pick<Home, "devices"> | null): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  const lights = (home?.devices ?? []).filter((d) => d.kind === "light" || d.kind === "plug");
  switch (body.op) {
    case "toggle": if (body.id) o[`dev:${body.id}:on`] = !!body.on; break;
    case "many": for (const id of body.ids ?? []) o[`dev:${id}:on`] = !!body.on; break;
    case "brightness": for (const id of body.ids ?? []) { o[`dev:${id}:brightness`] = Math.max(0, Math.min(1, (body.pct ?? 0) / 100)); o[`dev:${id}:on`] = true; } break;
    case "kelvin": if (body.k) for (const id of body.ids ?? (body.id ? [body.id] : [])) { o[`dev:${id}:kelvin`] = body.k; o[`dev:${id}:on`] = true; } break;
    case "color": if (body.h != null && body.s != null) for (const id of body.ids ?? []) { o[`dev:${id}:color`] = [body.h, body.s]; o[`dev:${id}:on`] = true; } break;
    case "fan": if (body.id && body.pct != null) { o[`dev:${body.id}:percentage`] = Math.max(0, Math.min(1, body.pct / 100)); o[`dev:${body.id}:on`] = body.pct > 0; } break;
    case "oscillate": if (body.id) o[`dev:${body.id}:oscillating`] = !!body.on; break;
    case "direction": if (body.id && body.name) o[`dev:${body.id}:direction`] = body.name; break;
    case "preset": if (body.id && body.name) o[`dev:${body.id}:preset`] = body.name; break;
    case "media": if (body.id && (body.action === "play" || body.action === "pause")) o[`dev:${body.id}:playing`] = body.action === "play"; break;
    case "volume": if (body.id && body.level != null) o[`dev:${body.id}:volume`] = body.level; break;
    case "musicLights": o.musicLights = !!body.on; break;
    case "scene":
      if (body.name === "night" || body.name === "leaving") for (const l of lights) if (!/\bled\b/i.test(l.name)) o[`dev:${l.id}:on`] = false;
      if (body.name === "leaving") o.away = true; if (body.name === "returning") o.away = false;
      break;
    case "permuta":
      if (body.cmd?.type === "music") { if (body.cmd.action === "play" || body.cmd.action === "pause") o["music.playing"] = body.cmd.action === "play"; if (body.cmd.action === "volume" && body.cmd.level != null) o["music.volume"] = body.cmd.level; }
      break;
  }
  return o;
}

/** The home state with the pending overrides applied (what the user just did shows immediately). */
export function applyHome(home: Home | null, map: Opt): Home | null {
  if (!home || !Object.keys(map).length) return home;
  const devices = home.devices.map((d) => {
    const g = (f: string) => map[`dev:${d.id}:${f}`]?.value;
    const col = g("color"), on = g("on"), br = g("brightness"), pc = g("percentage"), kv = g("kelvin"), osc = g("oscillating"), dir = g("direction"), pr = g("preset"), pl = g("playing"), vol = g("volume");
    if ([on, br, pc, kv, osc, dir, pr, pl, vol, col].every((v) => v === undefined)) return d;
    return { ...d, ...(on !== undefined ? { on: !!on } : {}), ...(br !== undefined ? { brightness: br as number } : {}), ...(pc !== undefined ? { percentage: pc as number } : {}), ...(kv !== undefined ? { kelvin: kv as number } : {}), ...(col !== undefined ? { color: col as [number, number] } : {}),
      ...(osc !== undefined ? { oscillating: !!osc } : {}), ...(dir !== undefined ? { direction: dir as string } : {}), ...(pr !== undefined ? { preset: pr as string } : {}), ...(pl !== undefined ? { playing: !!pl } : {}), ...(vol !== undefined ? { volume: vol as number } : {}) };
  });
  return { ...home, devices, ...(map.musicLights ? { musicLights: !!map.musicLights.value } : {}), ...(map.away ? { away: !!map.away.value } : {}) };
}
export function applyMusic<M extends { playing: boolean; volume?: number }>(m: M | null, map: Opt): M | null {
  if (!m) return m;
  const pl = map["music.playing"]?.value, vol = map["music.volume"]?.value;
  return pl === undefined && vol === undefined ? m : { ...m, ...(pl !== undefined ? { playing: !!pl } : {}), ...(vol !== undefined ? { volume: vol as number } : {}) };
}
/** The reported value for each override key (so a report that matches an override confirms it). */
export function reportedFor(map: Opt, home: Home | null, music: { playing: boolean; volume?: number } | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(map)) {
    if (k === "musicLights") { if (home) out[k] = home.musicLights; } else if (k === "away") { if (home) out[k] = home.away; }
    else if (k === "music.playing") { if (music) out[k] = music.playing; } else if (k === "music.volume") { if (music?.volume != null) out[k] = music.volume; }
    else if (k.startsWith("dev:")) { const [, id, f] = k.split(":"); const d = home?.devices.find((x) => x.id === id); if (d) { const v = (d as unknown as Record<string, unknown>)[f]; if (v !== undefined) out[k] = v; } }
  }
  return out;
}
