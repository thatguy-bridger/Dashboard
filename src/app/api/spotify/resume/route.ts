import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/smarthome";
import { resumeMusic } from "@/lib/spotifyPlay";
import { npState } from "@/lib/nowPlayingCache";

export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  const err = await resumeMusic();
  npState.cache = null;
  return err ? NextResponse.json({ error: err }, { status: 502 }) : NextResponse.json({ ok: true });
}
