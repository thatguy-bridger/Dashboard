import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/smarthome";

export async function GET(req: NextRequest) {
  if (checkPin(req.headers.get("x-control-pin")) !== "ok") return NextResponse.json({ error: "pin" }, { status: 401 });
  const U = (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/+$/, "");
  const h = { Authorization: `Bearer ${process.env.HOME_ASSISTANT_TOKEN}`, "Content-Type": "application/json" };
  const states = (await (await fetch(`${U}/api/states`, { headers: h })).json()) as { entity_id: string; state: string; attributes: Record<string, unknown> }[];
  const out: Record<string, unknown> = {};
  for (const kind of ["automation", "script"] as const) {
    for (const s of states.filter((x) => x.entity_id.startsWith(`${kind}.`))) {
      const id = (kind === "automation" ? (s.attributes.id as string) : s.entity_id.split(".")[1]);
      const r = await fetch(`${U}/api/config/${kind}/config/${id}`, { headers: h });
      const cfg = r.ok ? await r.json() : null;
      const txt = JSON.stringify(cfg ?? {});
      if (/media_player|spotify|music|play_media|google_assistant_sdk/i.test(txt) || /music|spotify|play/i.test(String(s.attributes.friendly_name))) out[s.entity_id] = { name: s.attributes.friendly_name, state: s.state, cfg };
    }
  }
  const scenes = states.filter((x) => x.entity_id.startsWith("scene.")).map((x) => x.attributes.friendly_name);
  return NextResponse.json({ out, scenes });
}
