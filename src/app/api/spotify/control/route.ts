import { NextRequest, NextResponse } from "next/server";
import { getValidSpotifyToken } from "@/lib/spotify";
import { npState } from "@/lib/nowPlayingCache";
import { getGuestState } from "@/lib/smarthome/guest";

const ACTIONS: Record<string, { method: string; path: string }> = {
  play: { method: "PUT", path: "play" },
  pause: { method: "PUT", path: "pause" },
  next: { method: "POST", path: "next" },
  previous: { method: "POST", path: "previous" },
};

/** Playback controls for the StandBy card. Needs the user-modify-playback-state
 *  scope (reconnect Spotify once after this ships) and a Premium account. */
export async function POST(req: NextRequest) {
  const { action, value } = await req.json();
  // guests can pause the music but not start it or change it
  if (action !== "pause" && (await getGuestState()).active) return NextResponse.json({ error: "guest_mode" }, { status: 403 });
  const token = await getValidSpotifyToken();
  if (!token) return NextResponse.json({ error: "not connected" }, { status: 401 });

  let url = "https://api.spotify.com/v1/me/player/";
  let method = "PUT";
  if (action === "volume" && typeof value === "number") {
    url += `volume?volume_percent=${Math.max(0, Math.min(100, Math.round(value)))}`;
  } else if (ACTIONS[action]) {
    url += ACTIONS[action].path;
    method = ACTIONS[action].method;
  } else {
    return NextResponse.json({ error: "bad action" }, { status: 400 });
  }

  npState.cache = null;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok && res.status !== 204) {
    return NextResponse.json({ error: "spotify refused", status: res.status }, { status: res.status });
  }
  npState.cache = null;
  return NextResponse.json({ ok: true });
}
