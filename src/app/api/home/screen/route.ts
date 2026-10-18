import { NextRequest, NextResponse } from "next/server";
import { loadTabletCfg, saveTabletCfg } from "@/lib/tabletConfig";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { installBatteryLog, installMotionWake, mobileAppServices, tabletBattery, tabletCommand } from "@/lib/smarthome/homeAssistant";

const deny = (gate: string) => NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

/** Which Home Assistant apps can be told to dim, and which one is the wall tablet. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  // ?battery=1 -> this tablet's battery as Home Assistant's app reports it (for browsers without the Battery API)
  if (req.nextUrl.searchParams.get("battery") === "1") {
    const cfg = await loadTabletCfg();
    if (!haConfigured() || !cfg.service) return NextResponse.json({ level: null });
    return NextResponse.json(await tabletBattery(cfg.service.replace(/^mobile_app_/, "")), { headers: { "Cache-Control": "no-store" } });
  }
  if (!haConfigured()) return NextResponse.json({ services: [], config: await loadTabletCfg() });
  return NextResponse.json({ services: await mobileAppServices(), config: await loadTabletCfg() });
}

/** Body: { mode: "dim" | "wake" } or { service, awake? } to choose the tablet / its normal brightness (0-255). */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  if (!haConfigured()) return NextResponse.json({ ok: false, error: "no_home_assistant" });
  const b = await req.json().catch(() => ({}));
  let cfg = await loadTabletCfg();
  if (typeof b.service === "string" || typeof b.awake === "number") {
    cfg = { service: typeof b.service === "string" ? b.service.replace(/^notify\./, "") : cfg.service, awake: typeof b.awake === "number" ? Math.max(10, Math.min(255, Math.round(b.awake))) : cfg.awake };
    await saveTabletCfg(cfg);
    if (!b.mode) return NextResponse.json({ ok: true, config: cfg });
  }
  if (b.install === "battery_log") {
    try { await installBatteryLog(); return NextResponse.json({ ok: true }); }
    catch (err) { return NextResponse.json({ ok: false, error: "install_failed", detail: String(err) }, { status: 502 }); }
  }
  if (b.install === "motion_wake") {
    if (!cfg.service) return NextResponse.json({ ok: false, error: "no_tablet" });
    try { const { owner } = await installMotionWake(cfg.service, cfg.awake); return NextResponse.json({ ok: true, owner }); }
    catch (err) { return NextResponse.json({ ok: false, error: "install_failed", detail: String(err) }, { status: 502 }); }
  }
  if (b.mode === "off") {
    if (!cfg.service) return NextResponse.json({ ok: false, error: "no_tablet" });
    try { await tabletCommand(cfg.service, "command_screen_off"); return NextResponse.json({ ok: true }); }
    catch (err) { return NextResponse.json({ ok: false, error: "command_failed", detail: String(err) }, { status: 502 }); }
  }
  if (b.mode === "level" && typeof b.level === "number") {
    if (!cfg.service) return NextResponse.json({ ok: false, error: "no_tablet" });
    try {
      await Promise.all([
        tabletCommand(cfg.service, "command_auto_screen_brightness", { command: "turn_off" }),
        tabletCommand(cfg.service, "command_screen_brightness_level", { command: Math.max(1, Math.min(255, Math.round(b.level))) }),
      ]);
      return NextResponse.json({ ok: true });
    } catch (err) { return NextResponse.json({ ok: false, error: "command_failed", detail: String(err) }, { status: 502 }); }
  }
  if (b.mode !== "dim" && b.mode !== "wake") return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!cfg.service) return NextResponse.json({ ok: false, error: "no_tablet" });
  try {
    // independent commands to the same tablet: send them together instead of one after another
    await Promise.all([
      tabletCommand(cfg.service, "command_auto_screen_brightness", { command: "turn_off" }),
      ...(b.mode === "wake" ? [tabletCommand(cfg.service, "command_screen_on")] : []),
      tabletCommand(cfg.service, "command_screen_brightness_level", { command: b.mode === "dim" ? 1 : cfg.awake }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "command_failed", detail: String(err) }, { status: 502 });
  }
}
