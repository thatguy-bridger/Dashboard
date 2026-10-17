import { d1Query } from "@/lib/d1";
import { getProvider } from "@/lib/smarthome";
import { getValidSpotifyToken } from "@/lib/spotify";

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
export async function resolveDevice(token: string, want: MusicPrefs): Promise<Dev | null> {
  const h = { Authorization: `Bearer ${token}` };
  const devices = async (): Promise<Dev[]> => {
    const r = await fetch("https://api.spotify.com/v1/me/player/devices", { headers: h, cache: "no-store" });
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
  const token = await getValidSpotifyToken();
  if (!token) return "not_connected";
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const stateRes = await fetch("https://api.spotify.com/v1/me/player?additional_types=track", { headers: h, cache: "no-store" });
  const state = stateRes.status === 200 ? await stateRes.json() : null;
  if (state?.is_playing) return null; // already playing: leave it alone

  let item: { uri: string } | null = state?.item ?? null;
  let context: { type: string; uri: string } | null = state?.context ?? null;
  let position = state?.progress_ms ?? 0;
  if (!item) {
    const r = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1", { headers: h, cache: "no-store" });
    const last = r.ok ? (await r.json()).items?.[0] : null;
    if (!last?.track) return r.status === 403 ? "reconnect" : "nothing_to_resume";
    item = last.track;
    context = last.context ?? null;
    position = 0;
  }
  const prefs = await loadMusicPrefs();
  const want: MusicPrefs = prefs.deviceId || prefs.deviceName ? prefs : { ...prefs, deviceId: state?.device?.id };
  const device = await resolveDevice(token, want);
  if (!device) return "no_device";
  const body = context && (context.type === "playlist" || context.type === "album")
    ? { context_uri: context.uri, offset: { uri: item!.uri }, position_ms: position }
    : { uris: [item!.uri], position_ms: position };
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(device.id)}`, { method: "PUT", headers: h, body: JSON.stringify(body), cache: "no-store" });
  return res.ok || res.status === 204 ? null : "spotify_refused";
}
