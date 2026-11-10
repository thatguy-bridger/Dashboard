// Spotify read straight from the server, for when Permuta isn't running (computer closed). Uses the same sign-in as Permuta (PKCE, no secret): the refresh token lives in a Vercel env var.
let cached: { token: string; until: number } | null = null;

async function accessToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID, refresh = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!id || !refresh) return null;
  if (cached && cached.until > Date.now() + 30000) return cached.token;
  try {
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: id }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    cached = { token: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return cached.token;
  } catch { return null; }
}

/** What's playing now, shaped like the music state Permuta saves. Null when nothing is playing or Spotify can't be reached. */
export async function spotifyNow(now = Date.now()): Promise<Record<string, unknown> | null> {
  const t = await accessToken();
  if (!t) return null;
  try {
    const r = await fetch("https://api.spotify.com/v1/me/player?additional_types=episode", { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
    if (r.status !== 200) return null;
    const j = await r.json();
    const it = j?.item;
    if (!it?.id) return null;
    const artists: string[] = (it.artists ?? []).map((a: { name: string }) => a.name);
    const images = it.album?.images ?? it.images ?? [];
    return {
      playing: !!j.is_playing, track: it.name, artist: artists.join(", ") || it.show?.name || "", artists, album: it.album?.name ?? it.show?.name ?? "",
      art: images[0]?.url ?? "", progress: (j.progress_ms ?? 0) / 1000, duration: (it.duration_ms ?? 0) / 1000, at: now,
      device: j.device?.name ?? "", volume: (j.device?.volume_percent ?? 50) / 100, trackId: it.id, palette: [], fromServer: true,
    };
  } catch { return null; }
}
