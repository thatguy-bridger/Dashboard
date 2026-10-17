import { NextResponse } from "next/server";
import { getValidSpotifyToken } from "@/lib/spotify";
import { npState } from "@/lib/nowPlayingCache";

// Per-instance cache + 429 backoff: many screens/tabs poll this, and Spotify
// locks the whole app out for up to an hour once it starts returning 429.
const CACHE_MS = 1500;
// Never edge-cache this: a CDN window made pause take ~15s to show. The 1.5s in-memory cache below
// still shields Spotify when several screens poll.
const NO_STORE = { headers: { "Cache-Control": "no-store" } };


export async function GET() {
  if (Date.now() < npState.blockedUntil) {
    return NextResponse.json(
      npState.cache?.body ?? { connected: true, isPlaying: false, track: null, error: "rate limited by Spotify" },
      NO_STORE
    );
  }
  if (npState.cache && Date.now() - npState.cache.at < CACHE_MS) return NextResponse.json(npState.cache.body, NO_STORE);

  const body = await fetchNowPlaying();
  npState.cache = { at: Date.now(), body };
  return NextResponse.json(body, NO_STORE);
}

async function fetchNowPlaying(): Promise<Record<string, unknown>> {
  const token = await getValidSpotifyToken();
  if (!token) {
    return ({ connected: false, isPlaying: false, track: null });
  }

  const res = await fetch("https://api.spotify.com/v1/me/player?additional_types=track", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  // 204 = nothing currently playing (not an error).
  if (res.status === 204 || res.status === 404) {
    return ({ connected: true, isPlaying: false, track: null });
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after")) || 60;
    npState.blockedUntil = Date.now() + retry * 1000;
  }
  if (!res.ok) {
    return ({ connected: true, isPlaying: false, track: null, error: "spotify request failed" });
  }

  const data = await res.json();
  const item = data.item;
  if (!item || item.type !== "track") {
    return ({ connected: true, isPlaying: false, track: null });
  }

  return ({
    connected: true,
    isPlaying: Boolean(data.is_playing),
    fetchedAt: Date.now(),
    volumePercent: data.device?.volume_percent ?? null,
    track: {
      id: item.id,
      name: item.name,
      artists: item.artists.map((a: { name: string }) => a.name).join(", "),
      album: item.album.name,
      albumArtUrl: item.album.images?.[0]?.url ?? null,
      durationMs: item.duration_ms,
      progressMs: data.progress_ms ?? 0,
    },
  });
}
