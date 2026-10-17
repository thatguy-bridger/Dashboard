import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider, haConfigured } from "@/lib/smarthome";
import { installAwayScripts } from "@/lib/smarthome/homeAssistant";

/** Body: { mode: "leave" | "return" }. Leave remembers what was on and turns everything off;
 *  return puts it back. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  const { mode } = await req.json().catch(() => ({}));
  if (mode === "install") {
    if (!haConfigured()) return NextResponse.json({ error: "no_home_assistant" }, { status: 400 });
    try { return NextResponse.json({ ok: true, scripts: await installAwayScripts() }); }
    catch (err) { return NextResponse.json({ error: "install_failed", detail: String(err) }, { status: 502 }); }
  }
  if (mode !== "leave" && mode !== "return") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const provider = getProvider();
  try {
    if (mode === "leave") await provider.leaveHome?.();
    else await provider.returnHome?.();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "away_failed", detail: String(err) }, { status: 502 });
  }
}
