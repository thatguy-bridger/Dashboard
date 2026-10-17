import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/smarthome";
import { getHomeConfig, saveHomeConfig } from "@/lib/smarthome/config";

/** Body: { id, keep }. Flags a light/switch as "stays on" when All lights is turned off. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });
  const { id, keep } = await req.json().catch(() => ({}));
  if (typeof id !== "string" || typeof keep !== "boolean") return NextResponse.json({ error: "bad request" }, { status: 400 });
  const config = await getHomeConfig();
  const set = new Set(config.keepOn);
  if (keep) set.add(id); else set.delete(id);
  config.keepOn = [...set];
  await saveHomeConfig(config);
  return NextResponse.json({ keepOn: config.keepOn });
}
