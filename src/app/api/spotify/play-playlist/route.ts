import { NextRequest, NextResponse, after } from "next/server";
import { d1Query } from "@/lib/d1";
import { spotifyFetch } from "@/lib/music/spotifyApi";
import { tick } from "@/lib/music/conductor";
import { checkPin } from "@/lib/smarthome";
import { getGuestState } from "@/lib/smarthome/guest";
import { resolveDevice } from "@/lib/spotifyPlay";
import { haConfigured } from "@/lib/smarthome";
import { assistantAvailable, assistantCommand } from "@/lib/smarthome/homeAssistant";

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

  const device = await resolveDevice({
    deviceId: (typeof b.deviceId === "string" && b.deviceId) || saved.deviceId,
    deviceName: (typeof b.deviceName === "string" && b.deviceName) || saved.deviceName,
    entityId: (typeof b.entityId === "string" && b.entityId) || saved.entityId,
  });
  if (!device) {
    // Spotify can't list this speaker (Nest/Cast speakers only appear while a Spotify session is running on them).
    // If Google Assistant is hooked up to Home Assistant, ask it the way a voice command would.
    const speaker = (typeof b.deviceName === "string" && b.deviceName) || saved.deviceName || null;
    const name = (typeof b.name === "string" && b.name) || saved.name || null;
    if (haConfigured() && speaker && name && (await assistantAvailable())) {
      try {
        await assistantCommand(`play ${name} playlist on Spotify on ${speaker}`);
        return NextResponse.json({ ok: true, via: "assistant" });
      } catch { /* fall through to the error */ }
    }
    return NextResponse.json({ error: "no_device", speaker }, { status: 404 });
  }

  const res = await spotifyFetch(`me/player/play?device_id=${encodeURIComponent(device.id)}`, { method: "PUT", body: JSON.stringify({ context_uri: uri }) });
  if (res.status === 401) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  if (!res.ok && res.status !== 204) return NextResponse.json({ error: res.status === 429 ? "rate_limited" : "spotify_refused", status: res.status }, { status: res.status === 429 ? 429 : 502 });
  after(async () => { await tick({ force: true }).catch(() => {}); });
  return NextResponse.json({ ok: true });
}
