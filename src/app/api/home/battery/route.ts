import { NextRequest, NextResponse } from "next/server";
import { batteryReport } from "@/lib/batteryLog";
import { checkPin } from "@/lib/smarthome";
import { tabletDeviceStates } from "@/lib/smarthome/homeAssistant";
import { loadTabletCfg } from "@/lib/tabletConfig";

/** The tablet's battery history and what drains it (see lib/batteryLog). ?days=7 */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  // ?keys=1: everything Home Assistant's app currently reports about the tablet (to see what can be logged)
  if (req.nextUrl.searchParams.get("keys") === "1") {
    const cfg = await loadTabletCfg();
    return NextResponse.json(cfg.service ? await tabletDeviceStates(cfg.service.replace(/^mobile_app_/, "")) : {});
  }
  const days = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get("days")) || 7));
  return NextResponse.json(await batteryReport(days), { headers: { "Cache-Control": "no-store" } });
}
