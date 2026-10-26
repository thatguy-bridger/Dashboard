import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/smarthome";

export async function GET(req: NextRequest) {
  if (checkPin(req.headers.get("x-control-pin")) !== "ok") return NextResponse.json({ error: "pin" }, { status: 401 });
  const U = (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/+$/, "");
  const h = { Authorization: `Bearer ${process.env.HOME_ASSISTANT_TOKEN}` };
  const mins = Number(req.nextUrl.searchParams.get("mins")) || 20;
  const ent = req.nextUrl.searchParams.get("e") || "light.light_bar_1";
  const since = new Date(Date.now() - mins * 60_000).toISOString();
  const hist = await (await fetch(`${U}/api/history/period/${since}?filter_entity_id=${ent}&significant_changes_only=0`, { headers: h })).json();
  const rows = ((hist[0] ?? []) as { state: string; last_changed: string; attributes?: Record<string, unknown> }[]).map((r) => ({ t: r.last_changed, s: r.state, b: r.attributes?.brightness, hs: r.attributes?.hs_color, ct: r.attributes?.color_temp_kelvin }));
  const log = await (await fetch(`${U}/api/error_log`, { headers: h })).text();
  const lines = log.split("\n").filter((l) => /hb_fade|script\.|home_base|tuya|Error|WARNING/i.test(l)).slice(-60);
  return NextResponse.json({ rows, lines });
}
