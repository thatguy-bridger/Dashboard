import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";
import { getValidSpotifyToken } from "@/lib/spotify";
import { checkPin } from "@/lib/smarthome";

const KEY = "musicDefaults";
export interface MusicDefaults { uri: string | null; name: string | null; deviceId: string | null }

async function getDefaults(): Promise<MusicDefaults> {
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [KEY]);
    const v = rows[0]?.value ? JSON.parse(rows[0].value) : {};
    return { uri: v.uri ?? null, name: v.name ?? null, deviceId: v.deviceId ?? null };
  } catch {
    return { uri: null, name: null, deviceId: null };
  }
}

const deny = (gate: string) => NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

/** Your playlists, the Spotify devices that can play them, and the saved default. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  const token = await getValidSpotifyToken();
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  const h = { Authorization: `Bearer ${token}` };
  const playlists: { uri: string; name: string; image: string | null; tracks: number }[] = [];
  let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";
  for (let i = 0; url && i < 4; i++) {
    const res: Response = await fetch(url, { headers: h, cache: "no-store" });
    if (res.status === 403 || res.status === 401) return NextResponse.json({ error: "reconnect" }, { status: 403 });
    if (!res.ok) return NextResponse.json({ error: "spotify_failed", status: res.status }, { status: 502 });
    const j = await res.json();
    for (const p of j.items ?? []) if (p) playlists.push({ uri: p.uri, name: p.name, image: p.images?.[0]?.url ?? null, tracks: p.tracks?.total ?? p.items?.total ?? 0 });
    url = j.next;
  }
  let devices: { id: string; name: string; active: boolean }[] = [];
  try {
    const d = await fetch("https://api.spotify.com/v1/me/player/devices", { headers: h, cache: "no-store" });
    if (d.ok) devices = ((await d.json()).devices ?? []).filter((x: { id: string | null }) => x.id).map((x: { id: string; name: string; is_active: boolean }) => ({ id: x.id, name: x.name, active: x.is_active }));
  } catch { /* devices are optional */ }
  return NextResponse.json({ playlists, devices, defaults: await getDefaults() });
}

/** Body: { uri, name, deviceId? } saves the default playlist (and the device to play it on). */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  const b = await req.json();
  const cur = await getDefaults();
  const next: MusicDefaults = {
    uri: typeof b.uri === "string" ? b.uri.slice(0, 120) : cur.uri,
    name: typeof b.name === "string" ? b.name.slice(0, 80) : cur.name,
    deviceId: "deviceId" in b ? (typeof b.deviceId === "string" ? b.deviceId.slice(0, 80) : null) : cur.deviceId,
  };
  await d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [KEY, JSON.stringify(next)]);
  return NextResponse.json({ defaults: next });
}
