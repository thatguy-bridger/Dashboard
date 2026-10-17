import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/music/conductor";
import { loadLightsCfg, resetToWhite, saveLightsCfg, type LightMode } from "@/lib/music/lights";
import { loadState, saveState } from "@/lib/music/state";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { getGuestState } from "@/lib/smarthome/guest";
import { installFadeScripts, installMusicTick, speakerStates } from "@/lib/smarthome/homeAssistant";

/** Body: { enabled?, modes? } changes the "Music lights" scene; { install: true } (re)creates the Home Assistant pieces
 *  (one fade script per light, and the automation that keeps the music brain updated). */
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
      return NextResponse.json({ ok: true, lights, speakers });
    } catch (err) { return NextResponse.json({ error: "install_failed", detail: String(err) }, { status: 502 }); }
  }
  const cfg = await loadLightsCfg(true);
  const next = { ...cfg };
  if (typeof body.enabled === "boolean") next.enabled = body.enabled;
  if (body.modes && typeof body.modes === "object") {
    next.modes = { ...cfg.modes };
    for (const [id, m] of Object.entries(body.modes as Record<string, unknown>)) if (m === "color" || m === "on" || m === "off") next.modes[id] = m as LightMode;
  }
  await saveLightsCfg(next);
  const state = await loadState();
  if (cfg.enabled && !next.enabled) {
    // switched off: stop the plans and put the lights back to plain white
    await saveState({ ...state, lights: null });
    await resetToWhite().catch(() => {});
  } else if (next.enabled) {
    // a fresh start: plan the song that is playing right now
    if (!cfg.enabled) await saveState({ ...state, lights: null });
    await tick({ force: true }).catch(() => {});
  }
  return NextResponse.json({ ok: true, lights: next });
}
