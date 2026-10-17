import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider } from "@/lib/smarthome";
import { getGuestState } from "@/lib/smarthome/guest";
import { installFadeScripts } from "@/lib/smarthome/homeAssistant";

interface Item {
  id: string;
  /** "color": a colour (hue/saturation); "white": a white at a temperature, or off; "onoff": plain on/off; "dim": brightness only */
  mode: "color" | "white" | "onoff" | "dim";
  h?: number;
  s?: number;
  kelvin?: number;
  /** target brightness (1-100) for "white"/"dim" */
  brightness?: number;
  on?: boolean;
  /** where a colour glide starts */
  from?: { h: number; s: number };
  /** brightness runs from -> to over the request (dim before a song ends, brighten as the next one starts) */
  ramp?: { from: number; to: number };
  /** the colour lands at once; only the brightness (if any) ramps */
  instant?: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpHue = (a: number, b: number, t: number) => { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
const r0 = Math.round;

/** Body: { items, seconds } or { install: true }.
 *  Each light gets its whole sequence in ONE call: a list of frames that Home Assistant plays on its own, pausing between
 *  them. A new command restarts that light's script, so an older fade can never fight a newer command. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if ((await getGuestState()).active) return NextResponse.json({ error: "guest_mode" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.install) {
    try { return NextResponse.json({ ok: true, lights: await installFadeScripts() }); }
    catch (err) { return NextResponse.json({ error: "install_failed", detail: String(err) }, { status: 502 }); }
  }
  // older pages sent { colors: [{ id, h, s }] }
  const raw: Partial<Item>[] = Array.isArray(body.items) ? body.items : Array.isArray(body.colors) ? body.colors.map((c: Item) => ({ ...c, mode: "color" })) : [];
  const items = raw.filter((i): i is Item => typeof i.id === "string" && (i.mode === "color" || i.mode === "white" || i.mode === "onoff" || i.mode === "dim")).slice(0, 20);
  if (items.length === 0) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const seconds = typeof body.seconds === "number" ? Math.max(0, Math.min(40, body.seconds)) : 0;
  const provider = getProvider();

  /** The frames for one light and the pause between them. */
  const plan = (it: Item): { frames: Record<string, unknown>[]; delay: number } | null => {
    const ramping = Boolean(it.ramp) && seconds > 0;
    const rampSteps = Math.max(2, Math.min(7, r0(seconds / 1.7) + 1)); // t = 0 ... 1, about 1.7s apart
    const bAt = (t: number) => r0(lerp(it.ramp!.from, it.ramp!.to, t));
    if (it.mode === "color" && typeof it.h === "number" && typeof it.s === "number") {
      const hs = [r0(it.h), r0(it.s)];
      if (it.instant || seconds <= 0 || !it.from) {
        if (!ramping) return { frames: [{ hs_color: hs }], delay: 0 };
        return { frames: Array.from({ length: rampSteps }, (_, k) => ({ hs_color: hs, brightness_pct: Math.max(1, bAt(k / (rampSteps - 1))) })), delay: seconds / (rampSteps - 1) };
      }
      // a glide: about every three seconds, colour only (never the brightness)
      const n = Math.max(2, r0(seconds / 3));
      return { frames: Array.from({ length: n }, (_, k) => ({ hs_color: [r0(lerpHue(it.from!.h, it.h!, (k + 1) / n)), r0(lerp(it.from!.s, it.s!, (k + 1) / n))] })), delay: seconds / n };
    }
    if (it.mode === "white" && it.on !== false) {
      const base: Record<string, unknown> = typeof it.kelvin === "number" ? { color_temp_kelvin: it.kelvin } : {};
      if (!ramping) return { frames: [{ ...base, brightness_pct: it.brightness ?? 100 }], delay: 0 };
      return { frames: Array.from({ length: rampSteps }, (_, k) => ({ ...(k === 0 ? base : {}), brightness_pct: Math.max(1, bAt(k / (rampSteps - 1))) })), delay: seconds / (rampSteps - 1) };
    }
    if (it.mode === "dim") {
      if (!it.ramp || seconds <= 0) return { frames: [{ brightness_pct: it.brightness ?? 30 }], delay: 0 };
      const n = Math.max(2, r0(seconds / 1.7));
      return { frames: Array.from({ length: n }, (_, k) => ({ brightness_pct: Math.max(1, bAt((k + 1) / n)) })), delay: seconds / n };
    }
    return null;
  };

  const apply = async (it: Item) => {
    const p = plan(it);
    if (p && provider.fade) { await provider.fade(it.id, p.frames, p.delay); return; }
    // plain on/off (and the demo, which has no fade scripts): cancel any fade first, then do it directly
    await provider.stopFade?.(it.id);
    if (p) { const last = p.frames[p.frames.length - 1]; if (last.hs_color) await provider.act(it.id, { type: "color", h: (last.hs_color as number[])[0], s: (last.hs_color as number[])[1] }); return; }
    if (it.mode === "white" && it.on === false) await provider.act(it.id, { type: "off" });
    else if (it.mode === "onoff") await provider.act(it.id, { type: it.on === false ? "off" : "on" });
  };
  try {
    await Promise.all(items.map((it) => apply(it).catch(() => {})));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "action_failed", detail: String(err) }, { status: 502 });
  }
}
