import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/smarthome";
import { getGuestState } from "@/lib/smarthome/guest";
import { resumeMusic } from "@/lib/spotifyPlay";

export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  if ((await getGuestState()).active) return NextResponse.json({ error: "guest_mode" }, { status: 403 });
  const err = await resumeMusic();
  return err ? NextResponse.json({ error: err }, { status: 502 }) : NextResponse.json({ ok: true });
}
