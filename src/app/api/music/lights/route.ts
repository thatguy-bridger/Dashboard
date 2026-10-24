import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/music/conductor";
import { loadLightsCfg, saveLightsCfg, type LightMode } from "@/lib/music/lights";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { getGuestState } from "@/lib/smarthome/guest";
import { installFadeScripts, installMusicLightsShared, installMusicTick, setMusicLightsEnabled, setMusicLightsSuggestion, speakerStates } from "@/lib/smarthome/homeAssistant";

/** Body: { enabled?, modes? } changes the "Music lights" scene (on/off is the shared switch in Home Assistant, so every app agrees);
 *  { suggest: "accept" | "dismiss" } answers the offer to turn it on; { install: true } (re)creates the Home Assistant pieces
 *  (one fade script per light, the music tick, the shared switches, the night script and the automations). */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if ((await getGuestState()).active) return NextResponse.json({ error: "guest_mode" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.install) {
    if (!haConfigured()) return NextResponse.json({ error: "no_home_assistant" }, { status: 400 });
    try {
      const lights = await installFadeScripts();
      const speakers = (await speakerStates()).map((s) => s.id);
      await installMusicTick(speakers);
      await installMusicLightsShared(speakers, (await loadLightsCfg(true)).enabled);
      return NextResponse.json({ ok: true, lights, speakers });
    } catch (err) { return NextResponse.json({ error: "install_failed", detail: String(err) }, { status: 502 }); }
  }
  const cfg = await loadLightsCfg(true);
  const next = { ...cfg };
  if (body.suggest === "accept") next.enabled = true;
  if (typeof body.enabled === "boolean") next.enabled = body.enabled;
  if (body.modes && typeof body.modes === "object") {
    next.modes = { ...cfg.modes };
    for (const [id, m] of Object.entries(body.modes as Record<string, unknown>)) if (m === "color" || m === "on" || m === "off") next.modes[id] = m as LightMode;
  }
  await saveLightsCfg(next);
  if (haConfigured()) {
    try {
      if (body.suggest === "accept" || typeof body.enabled === "boolean") await setMusicLightsEnabled(next.enabled);
      if (body.suggest === "accept" || body.suggest === "dismiss") await setMusicLightsSuggestion(false);
    } catch { /* the switch doesn't exist yet (not installed): the saved copy still works */ }
  }
  // apply it now: starts the plan for the song that is playing, or stops the plans and puts the lights back to white
  await tick({ force: true }).catch(() => {});
  return NextResponse.json({ ok: true, lights: next });
}
