import { NextRequest, NextResponse } from "next/server";
import { batteryReport } from "@/lib/batteryLog";
import { checkPin } from "@/lib/smarthome";

/** The tablet's battery history and what drains it (see lib/batteryLog). ?days=7 */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  const days = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get("days")) || 7));
  return NextResponse.json(await batteryReport(days), { headers: { "Cache-Control": "no-store" } });
}
