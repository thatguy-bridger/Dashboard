import { NextResponse } from "next/server";
import { getValidSpotifyToken } from "@/lib/spotify";

// Per-instance cache + 429 backoff: many screens/tabs poll this, and Spotify
// locks the whole app out for up to an hour once it starts returning 429.
let cache: { at: number; body: unknown } | null = null;
let blockedUntil = 0;
const CACHE_MS = 4000;

export async function GET() {
  if (Date.now() < blockedUntil) {
    return NextResponse.json(
      cache?.body ?? { connected: true, isPlaying: false, track: null, error: "rate limited by Spotify" }
    );
  }
  if (cache && Date.now() - cache.at < CACHE_MS) return NextResponse.json(cache.body);

  const body = await fetchNowPlaying();
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
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
    blockedUntil = Date.now() + retry * 1000;
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
