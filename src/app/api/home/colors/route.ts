import { NextRequest, NextResponse, after } from "next/server";
import { checkPin, getProvider } from "@/lib/smarthome";
import { getGuestState } from "@/lib/smarthome/guest";

// A slow fade is a loop of small steps with pauses; it runs after the reply, so the screen never waits on it.
export const maxDuration = 60;

interface Item {
  id: string;
  /** "color": a colour (hue/saturation); "white": a white at a temperature, or off; "onoff": plain on/off; "dim": brightness only */
  mode: "color" | "white" | "onoff" | "dim";
  h?: number;
  s?: number;
  kelvin?: number;
  /** target brightness (1-100) for "dim"/"white", or the brightness the light is at now (for dipping) */
  brightness?: number;
  on?: boolean;
  /** where the colour fades from */
  from?: { h: number; s: number };
  /** brightness ramps from -> to over the request (dim before a song ends, brighten as the next one starts) */
  ramp?: { from: number; to: number };
  /** the colour lands immediately; only the brightness ramps */
  instant?: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hueDist = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);
const lerpHue = (a: number, b: number, t: number) => { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Body: { items: [...], seconds } sets several lights at once. These bulbs can't fade on their own (their cloud has no
 *  transition), so changes are stepped: about one step every 2 seconds, up to six.
 *  A small hue change glides; a big one (green to pink would sweep through yellow and red) dips the brightness in the
 *  middle, changes colour there, and comes back up, so it never flashes through other colours. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if ((await getGuestState()).active) return NextResponse.json({ error: "guest_mode" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  // older pages sent { colors: [{ id, h, s }] }
  const raw: Partial<Item>[] = Array.isArray(body.items) ? body.items : Array.isArray(body.colors) ? body.colors.map((c: Item) => ({ ...c, mode: "color" })) : [];
  const items = raw.filter((i): i is Item => typeof i.id === "string" && (i.mode === "color" || i.mode === "white" || i.mode === "onoff" || i.mode === "dim")).slice(0, 20);
  if (items.length === 0) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const seconds = typeof body.seconds === "number" ? Math.max(0, Math.min(40, body.seconds)) : 0;
  const provider = getProvider();

  const apply = async (it: Item, t: number, first: boolean) => {
    const ramped = it.ramp ? lerp(it.ramp.from, it.ramp.to, t) : undefined;
    if (it.mode === "color" && typeof it.h === "number" && typeof it.s === "number") {
      const from = it.from ?? { h: it.h, s: 0 };
      if (it.instant) { await provider.act(it.id, { type: "color", h: it.h, s: it.s, brightness: ramped }); return; }
      if (hueDist(from.h, it.h) > 50) {
        // a big jump: dip, change colour at the bottom, come back up
        const base = it.brightness ?? 100;
        const dip = 1 - 0.6 * Math.sin(Math.PI * t); // 1 -> 0.4 (middle) -> 1
        const h = t < 0.5 ? from.h : it.h;
        const s = t < 0.5 ? from.s : it.s;
        await provider.act(it.id, { type: "color", h, s, brightness: Math.max(5, base * dip) });
        return;
      }
      await provider.act(it.id, { type: "color", h: lerpHue(from.h, it.h, t), s: lerp(from.s, it.s, t), brightness: ramped });
    } else if (it.mode === "dim") {
      await provider.act(it.id, { type: "brightness", value: ramped ?? it.brightness ?? 30 });
    } else if (it.mode === "white") {
      if (first) {
        if (it.on === false) { await provider.act(it.id, { type: "off" }); return; }
        if (typeof it.kelvin === "number") await provider.act(it.id, { type: "colorTemp", value: it.kelvin });
      }
      if (it.on !== false && (first || ramped != null)) await provider.act(it.id, { type: "brightness", value: ramped ?? it.brightness ?? 100 });
    } else if (first && it.mode === "onoff") {
      await provider.act(it.id, { type: it.on === false ? "off" : "on" });
    }
  };
  const run = async () => {
    const steps = seconds > 0 ? Math.max(1, Math.min(6, Math.round(seconds / 2))) : 1;
    for (let step = 1; step <= steps; step++) {
      await Promise.all(items.map((it) => apply(it, step / steps, step === 1).catch(() => {})));
      if (step < steps) await sleep((seconds * 1000) / steps);
    }
  };
  try {
    if (seconds > 0) after(run);
    else await run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "action_failed", detail: String(err) }, { status: 502 });
  }
}
