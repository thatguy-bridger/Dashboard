import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider, haConfigured } from "@/lib/smarthome";

/** Current state of every controllable thing. `?status=1` only reports how it's set up. */
export async function GET(req: NextRequest) {
  const provider = getProvider();
  if (req.nextUrl.searchParams.get("status") === "1") {
    return NextResponse.json({ provider: provider.name, homeAssistant: haConfigured(), pinSet: Boolean(process.env.CONTROL_PIN) });
  }
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  try {
    return NextResponse.json(await provider.snapshot());
  } catch (err) {
    return NextResponse.json({ error: "provider_failed", detail: String(err) }, { status: 502 });
  }
}
