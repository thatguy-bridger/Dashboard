import { NextRequest, NextResponse } from "next/server";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { motionState } from "@/lib/smarthome/homeAssistant";

// A held-open request can run several seconds.
export const maxDuration = 20;

/** "Did something move?" Plain call: answers at once. With ?wait=1&since=<ms>: holds the request open (up to ~9s)
 *  and answers the instant a motion sensor turns on after `since`, so the screen wakes without waiting for a poll. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if (!haConfigured()) return NextResponse.json({ sensors: 0, active: false, since: 0 });
  const wait = req.nextUrl.searchParams.get("wait") === "1";
  const since = Number(req.nextUrl.searchParams.get("since")) || 0;
  const headers = { "Cache-Control": "no-store" };
  try {
    let m = await motionState(wait);
    if (wait && m.sensors > 0) {
      const until = Date.now() + 9000;
      while (!(m.active && m.since > since) && Date.now() < until) {
        await new Promise((r) => setTimeout(r, 250));
        m = await motionState(true);
      }
    }
    return NextResponse.json(m, { headers });
  } catch (err) {
    return NextResponse.json({ error: "provider_failed", detail: String(err) }, { status: 502 });
  }
}
