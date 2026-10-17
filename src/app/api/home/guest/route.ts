import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/smarthome";
import { getGuestState, saveGuest, type GuestMode } from "@/lib/smarthome/guest";
import { haConfigured } from "@/lib/smarthome";
import { ownerNearby } from "@/lib/smarthome/homeAssistant";

/** Guest mode state (for the screen). */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  return NextResponse.json(await getGuestState(true));
}

/** Body: { pin, action: "unlock" | "relock" | "mode", mode? }. The PIN is typed again each time: the tablet remembers one
 *  for normal use, but getting out of guest mode must be the owner. unlock = 4 hours of normal control. */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  // No PIN needed when the owner's phone is nearby: Home Assistant says it's home (and on Wi-Fi, if it reports that).
  if (b.action === "unlock" && b.proximity === true && haConfigured()) {
    try {
      const near = await ownerNearby();
      if (near.nearby) {
        await saveGuest({ overrideUntil: Date.now() + 4 * 3600_000, mode: "auto" });
        return NextResponse.json({ ...(await getGuestState(true)), unlockedBy: "phone" });
      }
    } catch { /* fall through to the PIN */ }
    return NextResponse.json({ error: "phone_not_nearby" }, { status: 401 });
  }
  const gate = checkPin(typeof b.pin === "string" ? b.pin : null);
  if (gate !== "ok") return NextResponse.json({ error: gate === "needs_pin" ? "bad_pin" : gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if (b.action === "unlock") await saveGuest({ overrideUntil: Date.now() + 4 * 3600_000, mode: "auto" });
  else if (b.action === "relock") await saveGuest({ overrideUntil: 0 });
  else if (b.action === "mode" && (b.mode === "auto" || b.mode === "on" || b.mode === "off")) await saveGuest({ mode: b.mode as GuestMode, overrideUntil: 0 });
  else return NextResponse.json({ error: "bad request" }, { status: 400 });
  return NextResponse.json(await getGuestState(true));
}
