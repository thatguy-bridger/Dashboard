import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";
import { spotifyFetch } from "@/lib/music/spotifyApi";
import { checkPin, getProvider, haConfigured } from "@/lib/smarthome";

const KEY = "musicDefaults";
export interface MusicDefaults { uri: string | null; name: string | null; deviceId: string | null; deviceName: string | null; entityId: string | null }
export const normName = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");

async function getDefaults(): Promise<MusicDefaults> {
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [KEY]);
    const v = rows[0]?.value ? JSON.parse(rows[0].value) : {};
    return { uri: v.uri ?? null, name: v.name ?? null, deviceId: v.deviceId ?? null, deviceName: v.deviceName ?? null, entityId: v.entityId ?? null };
  } catch {
    return { uri: null, name: null, deviceId: null, deviceName: null, entityId: null };
  }
}

const deny = (gate: string) => NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

/** Your playlists, the Spotify devices that can play them, and the saved default. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  const playlists: { uri: string; name: string; image: string | null; tracks: number }[] = [];
  let url: string | null = "me/playlists?limit=50";
  for (let i = 0; url && i < 4; i++) {
    const res: Response = await spotifyFetch(url);
    if (res.status === 401) return NextResponse.json({ error: "not_connected" }, { status: 401 });
    if (res.status === 429) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    if (res.status === 403) return NextResponse.json({ error: "reconnect" }, { status: 403 });
    if (!res.ok) return NextResponse.json({ error: "spotify_failed", status: res.status }, { status: 502 });
    const j = await res.json();
    for (const p of j.items ?? []) if (p) playlists.push({ uri: p.uri, name: p.name, image: p.images?.[0]?.url ?? null, tracks: p.tracks?.total ?? p.items?.total ?? 0 });
    url = j.next ? String(j.next).replace("https://api.spotify.com/v1/", "") : null;
  }
  let devices: { id: string; name: string; active: boolean }[] = [];
  try {
    const d = await spotifyFetch("me/player/devices");
    if (d.ok) devices = ((await d.json()).devices ?? []).filter((x: { id: string | null }) => x.id).map((x: { id: string; name: string; is_active: boolean }) => ({ id: x.id, name: x.name, active: x.is_active }));
  } catch { /* devices are optional */ }
  // The hidden "network" view: every speaker Home Assistant knows, joined to its Spotify device by name
  // (a speaker Spotify can't currently see is still listed; playing to it wakes it first).
  const network: { name: string; deviceId: string | null; entityId: string | null; active: boolean }[] = [];
  try {
    const ha = haConfigured() ? (await getProvider().snapshot()).entities.filter((e) => e.kind === "media") : [];
    const used = new Set<string>();
    for (const s of ha) {
      const d = devices.find((x) => normName(x.name) === normName(s.name) || normName(x.name).includes(normName(s.name)) || normName(s.name).includes(normName(x.name)));
      if (d) used.add(d.id);
      network.push({ name: d?.name ?? s.name, deviceId: d?.id ?? null, entityId: s.id, active: Boolean(d?.active) });
    }
    for (const d of devices) if (!used.has(d.id)) network.push({ name: d.name, deviceId: d.id, entityId: null, active: d.active });
  } catch { /* the plain device list still works */ }
  return NextResponse.json({ playlists, devices, network, defaults: await getDefaults() });
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
    deviceName: "deviceName" in b ? (typeof b.deviceName === "string" ? b.deviceName.slice(0, 80) : null) : cur.deviceName,
    entityId: "entityId" in b ? (typeof b.entityId === "string" ? b.entityId.slice(0, 80) : null) : cur.entityId,
  };
  await d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [KEY, JSON.stringify(next)]);
  return NextResponse.json({ defaults: next });
}
