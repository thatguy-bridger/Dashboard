import { NextRequest, NextResponse } from "next/server";

export interface LyricLine {
  timeMs: number;
  text: string;
}

const LRC_LINE = /^\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/;

/** Parses standard LRC-format synced lyrics ("[mm:ss.xx] text" per line) into
 *  a time-ordered list the widget can highlight against playback position. */
function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(LRC_LINE);
    if (!m) continue;
    const [, mm, ss, ms, text] = m;
    const timeMs = Number(mm) * 60_000 + Number(ss) * 1000 + Number((ms ?? "0").padEnd(3, "0"));
    const trimmed = text.trim();
    if (trimmed) lines.push({ timeMs, text: trimmed });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/** lrclib.net is a free, keyless synced-lyrics database (LRC format) — the
 *  same kind of source several open-source Apple-Music-style lyric apps use,
 *  since neither Spotify nor Apple expose synced lyrics via a public API. */
async function fetchFromLrclib(params: { track: string; artist: string; album?: string; durationSec?: number }) {
  const url = new URL("https://lrclib.net/api/get");
  url.searchParams.set("track_name", params.track);
  url.searchParams.set("artist_name", params.artist);
  if (params.album) url.searchParams.set("album_name", params.album);
  if (params.durationSec) url.searchParams.set("duration", String(params.durationSec));

  const res = await fetch(url, { headers: { "User-Agent": "HomeBaseDashboard/1.0" }, next: { revalidate: 3600 } });
  if (res.ok) return res.json();

  // Fall back to fuzzy search when the exact (track+artist+duration) lookup 404s —
  // common for remasters/deluxe editions with slightly different metadata.
  const searchUrl = new URL("https://lrclib.net/api/search");
  searchUrl.searchParams.set("track_name", params.track);
  searchUrl.searchParams.set("artist_name", params.artist);
  const searchRes = await fetch(searchUrl, { headers: { "User-Agent": "HomeBaseDashboard/1.0" } });
  if (!searchRes.ok) return null;
  const results = await searchRes.json();
  if (!Array.isArray(results) || results.length === 0) return null;

  if (params.durationSec) {
    results.sort(
      (a: { duration: number }, b: { duration: number }) =>
        Math.abs(a.duration - params.durationSec!) - Math.abs(b.duration - params.durationSec!)
    );
  }
  return results[0];
}

export async function GET(req: NextRequest) {
  const track = req.nextUrl.searchParams.get("track");
  const artist = req.nextUrl.searchParams.get("artist");
  const album = req.nextUrl.searchParams.get("album") ?? undefined;
  const durationMs = req.nextUrl.searchParams.get("durationMs");

  if (!track || !artist) {
    return NextResponse.json({ error: "track and artist are required" }, { status: 400 });
  }

  try {
    const result = await fetchFromLrclib({
      track,
      artist,
      album,
      durationSec: durationMs ? Math.round(Number(durationMs) / 1000) : undefined,
    });

    if (!result || (!result.syncedLyrics && !result.plainLyrics)) {
      return NextResponse.json({ synced: null, plain: null });
    }

    return NextResponse.json({
      synced: result.syncedLyrics ? parseLrc(result.syncedLyrics) : null,
      plain: result.plainLyrics ?? null,
    });
  } catch {
    return NextResponse.json({ synced: null, plain: null });
  }
}
