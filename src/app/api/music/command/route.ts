import { NextRequest, NextResponse } from "next/server";
import { command, type Command } from "@/lib/music/conductor";
import { toNowPlaying } from "@/lib/music/state";
import { getGuestState } from "@/lib/smarthome/guest";

const ACTIONS: Command[] = ["play", "pause", "next", "previous", "volume"];

/** Playback controls. Needs the user-modify-playback-state scope and a Premium account. The reply carries the updated record,
 *  so the screen that pressed the button is in step straight away. */
export async function POST(req: NextRequest) {
  const { action, value } = await req.json().catch(() => ({}));
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: "bad action" }, { status: 400 });
  // guests can pause the music but not start it or change it
  if (action !== "pause" && (await getGuestState()).active) return NextResponse.json({ error: "guest_mode" }, { status: 403 });
  const r = await command(action, typeof value === "number" ? value : undefined);
  if (!r.ok) return NextResponse.json({ error: "spotify refused", status: r.status, now: toNowPlaying(r.state) }, { status: r.status === 429 ? 429 : 502 });
  return NextResponse.json({ ok: true, now: toNowPlaying(r.state) });
}
