import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/smarthome";
import { disableEntityTemp } from "@/lib/smarthome/homeAssistant";

export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: 401 });
  try { return NextResponse.json({ ok: true, r: await disableEntityTemp("switch.wyze_notifications") }); }
  catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
