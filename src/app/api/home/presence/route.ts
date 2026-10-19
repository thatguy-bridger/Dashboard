import { NextRequest, NextResponse } from "next/server";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { tabletIdleMs } from "@/lib/smarthome/homeAssistant";

/** How long nobody has been in front of the tablet ({ idleMs }, null when unknown). The touch screen uses it to dim its own content
 *  in step with the backlight (which Home Assistant dims), and to stop polling when nobody is there. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if (!haConfigured()) return NextResponse.json({ idleMs: null });
  try {
    return NextResponse.json({ idleMs: await tabletIdleMs() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ idleMs: null });
  }
}
