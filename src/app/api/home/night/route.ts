import { NextRequest, NextResponse } from "next/server";
import { d1Query } from "@/lib/d1";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { nightMode } from "@/lib/smarthome/homeAssistant";

const KEY = "nightVolume";
const DEFAULT = 20;

async function getVolume(): Promise<number> {
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [KEY]);
    const n = Number(rows[0]?.value);
    return Number.isFinite(n) && rows[0]?.value != null ? n : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

const deny = (gate: string) => NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

/** The speaker volume "It's the night" sets. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  return NextResponse.json({ volume: await getVolume() });
}

/** Body: { volume } saves the night volume; { run: true, speakers: [ids] } runs it. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  const b = await req.json().catch(() => ({}));
  if (typeof b.volume === "number") {
    const v = Math.max(0, Math.min(100, Math.round(b.volume)));
    await d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [KEY, String(v)]);
    if (!b.run) return NextResponse.json({ volume: v });
  }
  if (b.run) {
    if (!haConfigured()) return NextResponse.json({ ok: true });
    const speakers = Array.isArray(b.speakers) ? b.speakers.filter((x: unknown): x is string => typeof x === "string").slice(0, 40) : [];
    try {
      await nightMode(await getVolume(), speakers);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: "night_failed", detail: String(err) }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "bad request" }, { status: 400 });
}
