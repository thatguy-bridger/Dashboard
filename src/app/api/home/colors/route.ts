import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider } from "@/lib/smarthome";

/** Body: { colors: [{ id, h, s }] }. Different colours on different lights, all sent at once (album-art lights). */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  const { colors } = await req.json().catch(() => ({}));
  if (!Array.isArray(colors)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const items = (colors as { id?: unknown; h?: unknown; s?: unknown }[])
    .filter((c): c is { id: string; h: number; s: number } => typeof c.id === "string" && typeof c.h === "number" && typeof c.s === "number")
    .slice(0, 20);
  if (items.length === 0) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    const provider = getProvider();
    await Promise.all(items.map((c) => provider.act(c.id, { type: "color", h: c.h, s: c.s })));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "action_failed", detail: String(err) }, { status: 502 });
  }
}
