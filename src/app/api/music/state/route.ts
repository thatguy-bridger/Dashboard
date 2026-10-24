import { NextRequest, NextResponse } from "next/server";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { musicLightsFlags, speakerStates } from "@/lib/smarthome/homeAssistant";
import { loadLightsCfg } from "@/lib/music/lights";
import { loadState, toNowPlaying } from "@/lib/music/state";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };
let cache: { at: number; body: Record<string, unknown> } | null = null;

/** What every screen reads: the music brain's record (see lib/music/conductor). The screens never ask Spotify. A one-second
 *  copy shields the database when several screens ask at once. */
export async function GET(req: NextRequest) {
  // ?debug=1 (with the control PIN): what every speaker reports right now, the second source the brain checks Spotify against
  if (req.nextUrl.searchParams.get("debug") === "1" && checkPin(req.headers.get("x-control-pin")) === "ok" && haConfigured()) {
    return NextResponse.json({ speakers: (await speakerStates()).filter((x) => x.state !== "off" && x.state !== "unavailable"), sharedSwitches: await musicLightsFlags().catch(() => null) }, NO_STORE);
  }
  if (cache && Date.now() - cache.at < 1000) return NextResponse.json({ ...cache.body, serverNow: Date.now() }, NO_STORE);
  const [state, lights] = await Promise.all([loadState(), loadLightsCfg()]);
  const body = { ...toNowPlaying(state), lights: { enabled: state.lightsEnabled ?? lights.enabled, ids: lights.ids, modes: lights.modes, suggest: Boolean(state.suggestLights) } };
  cache = { at: Date.now(), body };
  return NextResponse.json(body, NO_STORE);
}
