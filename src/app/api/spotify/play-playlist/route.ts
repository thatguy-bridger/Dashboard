import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";
import { getValidSpotifyToken } from "@/lib/spotify";
import { checkPin } from "@/lib/smarthome";
import { getGuestState } from "@/lib/smarthome/guest";
import { resolveDevice } from "@/lib/spotifyPlay";

/** Body: { uri?, deviceId? }. No uri = the saved default playlist. Plays on the given device, else
 *  the saved one, else whichever Spotify device is active, else the first one available. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if ((await getGuestState()).active) return NextResponse.json({ error: "guest_mode" }, { status: 403 });
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

  const device = await resolveDevice(token, {
    deviceId: (typeof b.deviceId === "string" && b.deviceId) || saved.deviceId,
    deviceName: (typeof b.deviceName === "string" && b.deviceName) || saved.deviceName,
    entityId: (typeof b.entityId === "string" && b.entityId) || saved.entityId,
  });
  if (!device) return NextResponse.json({ error: "no_device" }, { status: 404 });

  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(device.id)}`, { method: "PUT", headers: h, body: JSON.stringify({ context_uri: uri }), cache: "no-store" });
  if (!res.ok && res.status !== 204) return NextResponse.json({ error: "spotify_refused", status: res.status }, { status: 502 });
  return NextResponse.json({ ok: true });
}
