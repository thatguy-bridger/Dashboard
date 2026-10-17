import { NextRequest, NextResponse } from "next/server";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { lightsInfo } from "@/lib/smarthome/homeAssistant";

/** What each light really is: brand, model, which colour modes it supports, whether it can fade. Used to make the
 *  album-art lights look right on every brand. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if (!haConfigured()) return NextResponse.json({ lights: [] });
  return NextResponse.json({ lights: await lightsInfo() }, { headers: { "Cache-Control": "no-store" } });
}
