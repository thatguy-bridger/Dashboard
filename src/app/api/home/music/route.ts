import { NextRequest, NextResponse } from "next/server";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { browseMedia, playMedia } from "@/lib/smarthome/homeAssistant";

const deny = (gate: string) => NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

/** Browse a speaker's media library: ?entity=media_player.x[&id=...&type=...]. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  if (!haConfigured()) return NextResponse.json({ title: "Demo", children: [] });
  const q = req.nextUrl.searchParams;
  const entity = q.get("entity");
  if (!entity?.startsWith("media_player.")) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    return NextResponse.json(await browseMedia(entity, q.get("id") ?? undefined, q.get("type") ?? undefined));
  } catch (err) {
    return NextResponse.json({ error: "browse_failed", detail: String(err) }, { status: 502 });
  }
}

/** Body: { entity, id, type } starts that playlist on the speaker. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  const b = await req.json();
  if (typeof b.entity !== "string" || !b.entity.startsWith("media_player.") || typeof b.id !== "string" || typeof b.type !== "string") return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!haConfigured()) return NextResponse.json({ ok: true });
  try {
    await playMedia(b.entity, b.id, b.type);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "play_failed", detail: String(err) }, { status: 502 });
  }
}
