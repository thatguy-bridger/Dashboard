import { NextRequest, NextResponse, after } from "next/server";
import { checkPin, getProvider } from "@/lib/smarthome";
import { getGuestState } from "@/lib/smarthome/guest";

// A slow fade is a loop of small steps with pauses; it runs after the reply, so the screen never waits on it.
export const maxDuration = 60;

interface Item {
  id: string;
  /** "color": a colour (hue/saturation); "white": a white at a temperature, or off; "onoff": plain on/off */
  mode: "color" | "white" | "onoff";
  h?: number;
  s?: number;
  kelvin?: number;
  brightness?: number;
  on?: boolean;
  /** where the colour fades from */
  from?: { h: number; s: number };
}

const lerpHue = (a: number, b: number, t: number) => { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Body: { items: [...], seconds } sets several lights at once. These bulbs can't fade on their own (their cloud has no
 *  transition), so colour changes are stepped: about one step per 2.5 seconds, up to six. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if ((await getGuestState()).active) return NextResponse.json({ error: "guest_mode" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  // older pages sent { colors: [{ id, h, s }] }
  const raw: Partial<Item>[] = Array.isArray(body.items) ? body.items : Array.isArray(body.colors) ? body.colors.map((c: Item) => ({ ...c, mode: "color" })) : [];
  const items = raw.filter((i): i is Item => typeof i.id === "string" && (i.mode === "color" || i.mode === "white" || i.mode === "onoff")).slice(0, 20);
  if (items.length === 0) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const seconds = typeof body.seconds === "number" ? Math.max(0, Math.min(40, body.seconds)) : 0;
  const provider = getProvider();

  const apply = async (it: Item, t: number, first: boolean) => {
    if (it.mode === "color" && typeof it.h === "number" && typeof it.s === "number") {
      const from = it.from ?? { h: it.h, s: 0 };
      await provider.act(it.id, { type: "color", h: lerpHue(from.h, it.h, t), s: from.s + (it.s - from.s) * t });
    } else if (first && it.mode === "white") {
      if (it.on === false) { await provider.act(it.id, { type: "off" }); return; }
      if (typeof it.kelvin === "number") await provider.act(it.id, { type: "colorTemp", value: it.kelvin });
      await provider.act(it.id, { type: "brightness", value: it.brightness ?? 100 });
    } else if (first && it.mode === "onoff") {
      await provider.act(it.id, { type: it.on === false ? "off" : "on" });
    }
  };
  const run = async () => {
    const steps = seconds > 0 ? Math.max(1, Math.min(6, Math.round(seconds / 2.5))) : 1;
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
