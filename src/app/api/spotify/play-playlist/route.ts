import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";
import { getValidSpotifyToken } from "@/lib/spotify";
import { checkPin, getProvider } from "@/lib/smarthome";

/** Body: { uri?, deviceId? }. No uri = the saved default playlist. Plays on the given device, else
 *  the saved one, else whichever Spotify device is active, else the first one available. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  const token = await getValidSpotifyToken();
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  let saved: { uri?: string; deviceId?: string; deviceName?: string; entityId?: string } = {};
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", ["musicDefaults"]);
    if (rows[0]?.value) saved = JSON.parse(rows[0].value);
  } catch { /* none saved */ }
  const uri = typeof b.uri === "string" ? b.uri : saved.uri;
  if (!uri) return NextResponse.json({ error: "no_default" }, { status: 400 });
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
  type Dev = { id: string; name: string; is_active: boolean };
  const devices = async (): Promise<Dev[]> => {
    const r = await fetch("https://api.spotify.com/v1/me/player/devices", { headers: h, cache: "no-store" });
    return r.ok ? (await r.json()).devices ?? [] : [];
  };
  let list = await devices();
  const pick = (id?: string | null, name?: string | null) => list.find((d) => id && d.id === id) ?? (name ? list.find((d) => norm(d.name) === norm(name)) : undefined);
  const wantId = (typeof b.deviceId === "string" && b.deviceId) || saved.deviceId || null;
  const wantName = (typeof b.deviceName === "string" && b.deviceName) || saved.deviceName || null;
  const entityId = (typeof b.entityId === "string" && b.entityId) || saved.entityId || null;
  let device = pick(wantId, wantName);
  // A chosen speaker Spotify can't see right now: wake it through Home Assistant, then wait for it to show up.
  if (!device && entityId?.startsWith("media_player.")) {
    try { await getProvider().act(entityId, { type: "on" }); } catch { /* try anyway */ }
    for (let i = 0; i < 8 && !device; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      list = await devices();
      device = pick(wantId, wantName);
    }
  }
  if (!device && !wantId && !wantName) device = list.find((d) => d.is_active) ?? list[0];
  if (!device) return NextResponse.json({ error: "no_device" }, { status: 404 });

  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(device.id)}`, { method: "PUT", headers: h, body: JSON.stringify({ context_uri: uri }), cache: "no-store" });
  if (!res.ok && res.status !== 204) return NextResponse.json({ error: "spotify_refused", status: res.status }, { status: 502 });
  return NextResponse.json({ ok: true });
}
