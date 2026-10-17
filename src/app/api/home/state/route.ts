import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider } from "@/lib/smarthome";

/** Fresh state for a few devices: ?ids=light.a,light.b. The touch screen polls this right after a tap
 *  to learn the moment the device really changed, without re-reading the whole house. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 20);
  if (ids.length === 0) return NextResponse.json({ entities: [] });
  try {
    return NextResponse.json({ entities: await getProvider().peek(ids) });
  } catch (err) {
    return NextResponse.json({ error: "provider_failed", detail: String(err) }, { status: 502 });
  }
}
