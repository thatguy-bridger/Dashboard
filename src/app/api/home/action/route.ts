import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider, type HomeAction } from "@/lib/smarthome";

const SIMPLE = new Set(["toggle", "on", "off", "activate", "play", "pause", "next", "previous"]);

export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

  const body = await req.json();
  const id = typeof body.id === "string" ? body.id : "";
  const a = body.action;
  let action: HomeAction | null = null;
  if (a && SIMPLE.has(a.type)) action = { type: a.type };
  else if (a && (a.type === "brightness" || a.type === "volume") && typeof a.value === "number") action = { type: a.type, value: a.value };
  if (!id || !action) return NextResponse.json({ error: "bad request" }, { status: 400 });

  try {
    await getProvider().act(id, action);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "action_failed", detail: String(err) }, { status: 502 });
  }
}
