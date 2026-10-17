import { NextRequest, NextResponse, after } from "next/server";
import { checkPin, getProvider, haConfigured } from "@/lib/smarthome";
import { getHomeConfig } from "@/lib/smarthome/config";
import { resumeMusic } from "@/lib/spotifyPlay";
import { getValidSpotifyToken } from "@/lib/spotify";
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
    if (mode === "leave") {
      // Everything at once: Home Assistant's script (one call) and Spotify's own pause (stops music fastest).
      await Promise.all([
        provider.leaveHome?.(),
        (async () => {
          const token = await getValidSpotifyToken().catch(() => null);
          if (token) await fetch("https://api.spotify.com/v1/me/player/pause", { method: "PUT", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => {});
        })(),
      ]);
      return NextResponse.json({ ok: true });
    }
    await provider.returnHome?.();
    // Picking the music back up takes a few Spotify calls: do that after answering, so the lights aren't kept waiting.
    after(async () => { await resumeMusic().catch(() => {}); });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "away_failed", detail: String(err) }, { status: 502 });
  }
}
