import { NextRequest, NextResponse } from "next/server";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { motionState } from "@/lib/smarthome/homeAssistant";

/** Light poll for "did something move": the screen wakes, and the lights come back after "I'm leaving". */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if (!haConfigured()) return NextResponse.json({ sensors: 0, active: false, since: 0 });
  try {
    return NextResponse.json(await motionState(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: "provider_failed", detail: String(err) }, { status: 502 });
  }
}
