import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider, haConfigured } from "@/lib/smarthome";
import { getHomeConfig } from "@/lib/smarthome/config";
import { resumeMusic } from "@/lib/spotifyPlay";
import { installAwayScripts } from "@/lib/smarthome/homeAssistant";

/** Body: { mode: "leave" | "return" }. Leave remembers what was on and turns everything off;
 *  return puts it back. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  const { mode } = await req.json().catch(() => ({}));
  if (mode === "install") {
    if (!haConfigured()) return NextResponse.json({ error: "no_home_assistant" }, { status: 400 });
    try { return NextResponse.json({ ok: true, scripts: await installAwayScripts((await getHomeConfig()).keepOn) }); }
    catch (err) { return NextResponse.json({ error: "install_failed", detail: String(err) }, { status: 502 }); }
  }
  if (mode !== "leave" && mode !== "return") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const provider = getProvider();
  try {
    if (mode === "leave") await provider.leaveHome?.((await getHomeConfig()).keepOn);
    else await provider.returnHome?.();
    // Coming back: pick the music up where it was.
    const music = mode === "return" ? await resumeMusic().catch(() => "failed") : null;
    return NextResponse.json({ ok: true, music });
  } catch (err) {
    return NextResponse.json({ error: "away_failed", detail: String(err) }, { status: 502 });
  }
}
