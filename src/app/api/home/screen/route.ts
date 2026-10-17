import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { mobileAppServices, tabletCommand } from "@/lib/smarthome/homeAssistant";

const KEY = "tabletScreen";
interface Cfg { service: string | null; awake: number }

async function load(): Promise<Cfg> {
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [KEY]);
    const v = rows[0]?.value ? JSON.parse(rows[0].value) : {};
    return { service: typeof v.service === "string" ? v.service : null, awake: typeof v.awake === "number" ? v.awake : 170 };
  } catch {
    return { service: null, awake: 170 };
  }
}
const save = (c: Cfg) => d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [KEY, JSON.stringify(c)]);

const deny = (gate: string) => NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

/** Which Home Assistant apps can be told to dim, and which one is the wall tablet. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  if (!haConfigured()) return NextResponse.json({ services: [], config: await load() });
  return NextResponse.json({ services: await mobileAppServices(), config: await load() });
}

/** Body: { mode: "dim" | "wake" } or { service, awake? } to choose the tablet / its normal brightness (0-255). */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  if (!haConfigured()) return NextResponse.json({ ok: false, error: "no_home_assistant" });
  const b = await req.json().catch(() => ({}));
  let cfg = await load();
  if (typeof b.service === "string" || typeof b.awake === "number") {
    cfg = { service: typeof b.service === "string" ? b.service.replace(/^notify\./, "") : cfg.service, awake: typeof b.awake === "number" ? Math.max(10, Math.min(255, Math.round(b.awake))) : cfg.awake };
    await save(cfg);
    if (!b.mode) return NextResponse.json({ ok: true, config: cfg });
  }
  if (b.mode !== "dim" && b.mode !== "wake") return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!cfg.service) return NextResponse.json({ ok: false, error: "no_tablet" });
  try {
    await tabletCommand(cfg.service, "command_auto_screen_brightness", { command: "turn_off" });
    if (b.mode === "wake") await tabletCommand(cfg.service, "command_screen_on");
    await tabletCommand(cfg.service, "command_screen_brightness_level", { command: b.mode === "dim" ? 1 : cfg.awake });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "command_failed", detail: String(err) }, { status: 502 });
  }
}
