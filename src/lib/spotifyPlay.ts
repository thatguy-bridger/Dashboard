import { d1Query } from "@/lib/d1";
import { getProvider } from "@/lib/smarthome";
import { spotifyFetch } from "@/lib/music/spotifyApi";
import { tick } from "@/lib/music/conductor";

export interface MusicPrefs { uri?: string; deviceId?: string; deviceName?: string; entityId?: string }
type Dev = { id: string; name: string; is_active: boolean };

const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function loadMusicPrefs(): Promise<MusicPrefs> {
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", ["musicDefaults"]);
    return rows[0]?.value ? JSON.parse(rows[0].value) : {};
  } catch {
    return {};
  }
}

/** The Spotify device to play on: the wanted one (by id or name), waking a Home Assistant speaker that
 *  Spotify can't see yet; otherwise the active device; otherwise the first one. */
export async function resolveDevice(want: MusicPrefs): Promise<Dev | null> {
  const devices = async (): Promise<Dev[]> => {
    const r = await spotifyFetch("me/player/devices");
    return r.ok ? (await r.json()).devices ?? [] : [];
  };
  let list = await devices();
  const pick = () => list.find((d) => want.deviceId && d.id === want.deviceId) ?? (want.deviceName ? list.find((d) => norm(d.name) === norm(want.deviceName!)) : undefined);
  let device = pick();
  if (!device && want.entityId?.startsWith("media_player.")) {
    try { await getProvider().act(want.entityId, { type: "on" }); } catch { /* try anyway */ }
    for (let i = 0; i < 8 && !device; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      list = await devices();
      device = pick();
    }
  }
  if (!device && !want.deviceId && !want.deviceName) device = list.find((d) => d.is_active) ?? list[0];
  return device ?? null;
}

/** Pick music back up: exactly where Spotify was (same playlist/album, song and position), or, if Spotify
 *  has forgotten the session, the last song it played. Returns an error code or null. */
export async function resumeMusic(): Promise<string | null> {
  const stateRes = await spotifyFetch("me/player?additional_types=track");
  if (stateRes.status === 401) return "not_connected";
  if (stateRes.status === 429) return "rate_limited";
  const state = stateRes.status === 200 ? await stateRes.json() : null;
  if (state?.is_playing) return null; // already playing: leave it alone

  let item: { uri: string } | null = state?.item ?? null;
  let context: { type: string; uri: string } | null = state?.context ?? null;
  let position = state?.progress_ms ?? 0;
  if (!item) {
    const r = await spotifyFetch("me/player/recently-played?limit=1");
    const last = r.ok ? (await r.json()).items?.[0] : null;
    if (!last?.track) return r.status === 403 ? "reconnect" : "nothing_to_resume";
    item = last.track;
    context = last.context ?? null;
    position = 0;
  }
  const prefs = await loadMusicPrefs();
  const want: MusicPrefs = prefs.deviceId || prefs.deviceName ? prefs : { ...prefs, deviceId: state?.device?.id };
  const device = await resolveDevice(want);
  if (!device) return "no_device";
  const body = context && (context.type === "playlist" || context.type === "album")
    ? { context_uri: context.uri, offset: { uri: item!.uri }, position_ms: position }
    : { uris: [item!.uri], position_ms: position };
  const res = await spotifyFetch(`me/player/play?device_id=${encodeURIComponent(device.id)}`, { method: "PUT", body: JSON.stringify(body) });
  if (res.ok || res.status === 204) { await tick({ force: true }).catch(() => {}); return null; }
  return "spotify_refused";
}

/** Start the saved default playlist on the saved default speaker (morning wake-up). Returns an error code or null. */
export async function startDefaultPlaylist(): Promise<string | null> {
  const prefs = await loadMusicPrefs();
  if (!prefs.uri) return "no_default";
  const device = await resolveDevice(prefs);
  if (!device) return "no_device";
  const res = await spotifyFetch(`me/player/play?device_id=${encodeURIComponent(device.id)}`, { method: "PUT", body: JSON.stringify({ context_uri: prefs.uri }) });
  if (res.ok || res.status === 204) { await tick({ force: true }).catch(() => {}); return null; }
  return res.status === 401 ? "not_connected" : "spotify_refused";
}
