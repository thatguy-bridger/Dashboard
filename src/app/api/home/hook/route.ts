import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, randomBytes } from "crypto";
import { d1Query } from "@/lib/d1";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { getHomeConfig } from "@/lib/smarthome/config";
import { getGuestState } from "@/lib/smarthome/guest";
import { setSpeakersVolume } from "@/lib/smarthome/homeAssistant";
import { startDefaultPlaylist } from "@/lib/spotifyPlay";

const KEY = "hookSecret";

async function secret(create: boolean): Promise<string | null> {
  const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [KEY]).catch(() => []);
  if (rows[0]?.value) return rows[0].value;
  if (!create) return null;
  const s = randomBytes(18).toString("hex");
  await d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [KEY, s]);
  return s;
}

/** With the Control PIN: returns the link secret (made on first use) to put in Home Assistant's rest_command.
 *  With ?secret=...&do=morning_music (called by Home Assistant): starts the morning music. Only that one thing. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const given = q.get("secret");
  if (!given) {
    const gate = checkPin(req.headers.get("x-control-pin"));
    if (gate !== "ok") return NextResponse.json({ error: gate }, { status: 401 });
    return NextResponse.json({ secret: await secret(true) });
  }
  const real = await secret(false);
  const a = Buffer.from(given), b = Buffer.from(real ?? "");
  if (!real || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "no" }, { status: 401 });
  if (q.get("do") !== "morning_music") return NextResponse.json({ error: "unknown" }, { status: 400 });
  if ((await getGuestState(true)).active) return NextResponse.json({ ok: false, skipped: "guest_mode" });
  const volume = (await getHomeConfig()).morning.volume;
  if (haConfigured()) await setSpeakersVolume(volume).catch(() => {});
  const err = await startDefaultPlaylist();
  return NextResponse.json({ ok: !err, error: err });
}
