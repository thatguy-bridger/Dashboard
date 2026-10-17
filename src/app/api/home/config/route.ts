import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider } from "@/lib/smarthome";
import { getHomeConfig, parseHomeConfig, saveHomeConfig } from "@/lib/smarthome/config";

const deny = (gate: string) => NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

/** Everything the provider reports (unfiltered) plus the saved tweaks: powers the Control manager. */
export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  try {
    const [snap, config] = await Promise.all([getProvider().snapshot(), getHomeConfig()]);
    return NextResponse.json({ provider: snap.provider, entities: snap.entities, config });
  } catch (err) {
    return NextResponse.json({ error: "provider_failed", detail: String(err) }, { status: 502 });
  }
}

/** Replace names / rooms / hidden (scenes are managed through /api/home/scenes). */
export async function PUT(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  const body = await req.json();
  const current = await getHomeConfig();
  const next = parseHomeConfig({ ...body, scenes: current.scenes, keepOn: body.keepOn ?? current.keepOn, timers: current.timers, morning: current.morning });
  await saveHomeConfig(next);
  return NextResponse.json({ config: next });
}
