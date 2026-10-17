import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider } from "@/lib/smarthome";
import { getHomeConfig, saveHomeConfig } from "@/lib/smarthome/config";

/** Body: { id, minutes, action? } starts a "turn off (or on) in N minutes" timer; { id, cancel: true } stops it. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string" || b.id.startsWith("custom:")) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const provider = getProvider();
  const config = await getHomeConfig(); // already drops timers that have run out
  try {
    if (b.cancel) {
      delete config.timers[b.id];
      await Promise.all([saveHomeConfig(config), provider.cancelTimer?.(b.id)]);
      return NextResponse.json({ ok: true });
    }
    const minutes = Number(b.minutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) return NextResponse.json({ error: "bad request" }, { status: 400 });
    const action = b.action === "on" ? "on" : "off";
    config.timers[b.id] = { endsAt: Date.now() + Math.round(minutes) * 60_000, action };
    await Promise.all([saveHomeConfig(config), provider.startTimer?.(b.id, minutes, action)]);
    return NextResponse.json({ ok: true, timer: config.timers[b.id] });
  } catch (err) {
    return NextResponse.json({ error: "timer_failed", detail: String(err) }, { status: 502 });
  }
}
