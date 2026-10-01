import { NextResponse } from "next/server";
import { getValidSpotifyToken } from "@/lib/spotify";

export async function GET() {
  const token = await getValidSpotifyToken();
  if (!token) {
    return NextResponse.json({ connected: false, isPlaying: false, track: null });
  }

  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=track", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  // 204 = nothing currently playing (not an error).
  if (res.status === 204 || res.status === 404) {
    return NextResponse.json({ connected: true, isPlaying: false, track: null });
  }
  if (!res.ok) {
    return NextResponse.json({ connected: true, isPlaying: false, track: null, error: "spotify request failed" });
  }

  const data = await res.json();
  const item = data.item;
  if (!item || item.type !== "track") {
    return NextResponse.json({ connected: true, isPlaying: false, track: null });
  }

  return NextResponse.json({
    connected: true,
    isPlaying: Boolean(data.is_playing),
    fetchedAt: Date.now(),
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
