import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/smarthome";

export async function GET(req: NextRequest) {
  if (checkPin(req.headers.get("x-control-pin")) !== "ok") return NextResponse.json({ error: "pin" }, { status: 401 });
  const U = (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/+$/, "");
  const h = { Authorization: `Bearer ${process.env.HOME_ASSISTANT_TOKEN}`, "Content-Type": "application/json" };
  const states = (await (await fetch(`${U}/api/states`, { headers: h })).json()) as { entity_id: string; state: string; attributes: Record<string, unknown> }[];
  const autos = states.filter((s) => s.entity_id.startsWith("automation.home_base"));
  const cfgs: Record<string, unknown> = {};
  for (const a of autos) { const id = a.attributes.id as string; const r = await fetch(`${U}/api/config/automation/config/${id}`, { headers: h }); cfgs[a.entity_id] = r.ok ? await r.json() : r.status; }
  const services = (await (await fetch(`${U}/api/services`, { headers: h })).json()) as { domain: string; services: Record<string, unknown> }[];
  const rest = services.find((s) => s.domain === "rest_command");
  const mp = states.filter((s) => s.entity_id.startsWith("media_player.")).map((s) => ({ id: s.entity_id, state: s.state, a: s.attributes }));
  return NextResponse.json({ cfgs, rest: rest ? Object.keys(rest.services) : null, restDetail: rest?.services, mp });
}
