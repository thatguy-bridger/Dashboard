import { NextResponse } from "next/server";
import { loadLightsCfg } from "@/lib/music/lights";
import { loadState, toNowPlaying } from "@/lib/music/state";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };
let cache: { at: number; body: Record<string, unknown> } | null = null;

/** What every screen reads: the music brain's record (see lib/music/conductor). The screens never ask Spotify. A one-second
 *  copy shields the database when several screens ask at once. */
export async function GET() {
  if (cache && Date.now() - cache.at < 1000) return NextResponse.json({ ...cache.body, serverNow: Date.now() }, NO_STORE);
  const [state, lights] = await Promise.all([loadState(), loadLightsCfg()]);
  const body = { ...toNowPlaying(state), lights: { enabled: lights.enabled, ids: lights.ids, modes: lights.modes } };
  cache = { at: Date.now(), body };
  return NextResponse.json(body, NO_STORE);
}
