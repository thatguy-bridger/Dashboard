// What /api/screen returns, built from the rows Permuta saved (a pure function so it can be tested; the route only does the I/O).
import type { KV } from "./supabase";

const KNOWN = new Set(["agenda", "music", "status", "lyrics", "lyrics_next", "lights", "info"]);

export function buildScreen(kv: KV, weather: unknown, now: number) {
  const v = (k: string) => kv[k]?.v;
  // every other state:* row (school, mail, journal, car, battery, life ...) travels as `extra`, parsed by its source on the page: a new kind of info needs no change here
  const extra: Record<string, unknown> = {};
  for (const [k, r] of Object.entries(kv)) if (k.startsWith("state:") && !KNOWN.has(k.slice(6))) extra[k.slice(6)] = r.v;
  return {
    screen: v("config:screen") ?? null,
    location: v("config:location") ?? null,
    theme: v("config:theme") ?? null,
    lyrics: v("state:lyrics") ?? null,
    lyricsNext: v("state:lyrics_next") ?? null,
    lights: v("state:lights") ?? null,
    info: v("state:info") ?? null,
    extra,
    agenda: v("state:agenda") ?? null,
    music: v("state:music") ?? null,
    status: v("state:status") ?? null,
    updatedAt: kv["state:status"]?.at ?? null,
    weather,
    now,
  };
}
