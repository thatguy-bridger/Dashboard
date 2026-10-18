import { NextRequest, NextResponse, after } from "next/server";
import { d1Query } from "@/lib/d1";
import { tick } from "@/lib/music/conductor";
import { checkPin } from "@/lib/smarthome";
import { getGuestState } from "@/lib/smarthome/guest";
import { startPlaylist } from "@/lib/spotifyPlay";

/** Body: { uri?, deviceId? }. No uri = the saved default playlist. Plays on the given device, else
 *  the saved one, else whichever Spotify device is active, else the first one available. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if ((await getGuestState()).active) return NextResponse.json({ error: "guest_mode" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  let saved: { uri?: string; name?: string; deviceId?: string; deviceName?: string; entityId?: string } = {};
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", ["musicDefaults"]);
    if (rows[0]?.value) saved = JSON.parse(rows[0].value);
  } catch { /* none saved */ }
  const uri = typeof b.uri === "string" ? b.uri : saved.uri;
  if (!uri) return NextResponse.json({ error: "no_default" }, { status: 400 });

  const r = await startPlaylist(uri, {
    deviceId: (typeof b.deviceId === "string" && b.deviceId) || saved.deviceId,
    deviceName: (typeof b.deviceName === "string" && b.deviceName) || saved.deviceName,
    entityId: (typeof b.entityId === "string" && b.entityId) || saved.entityId,
  }, (typeof b.name === "string" && b.name) || saved.name || null);
  if ("error" in r) {
    const status = r.error === "no_device" ? 404 : r.status === 401 ? 401 : r.status === 429 ? 429 : 502;
    return NextResponse.json({ error: r.error, ...(r.error === "no_device" ? { speaker: r.speaker } : { status: r.status }) }, { status });
  }
  after(async () => { await tick({ force: true }).catch(() => {}); });
  return NextResponse.json({ ok: true, via: r.via });
}
