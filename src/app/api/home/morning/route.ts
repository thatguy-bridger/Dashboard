import { NextRequest, NextResponse } from "next/server";
import { loadTabletCfg } from "@/lib/tabletConfig";
import { checkPin, haConfigured } from "@/lib/smarthome";
import { getHomeConfig, parseMorning, saveHomeConfig } from "@/lib/smarthome/config";
import { installMorning, testMorning } from "@/lib/smarthome/homeAssistant";

const deny = (gate: string) => NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

export async function GET(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  return NextResponse.json({ morning: (await getHomeConfig()).morning });
}

/** Body: { morning } saves the settings and (re)creates the Home Assistant automation; { test: true } runs it now. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  const b = await req.json().catch(() => ({}));
  try {
    if (b.test) {
      if (!haConfigured()) return NextResponse.json({ ok: true });
      await testMorning();
      return NextResponse.json({ ok: true });
    }
    if (b.morning) {
      const config = await getHomeConfig();
      config.morning = parseMorning(b.morning);
      await saveHomeConfig(config);
      if (haConfigured()) await installMorning(config.morning, await loadTabletCfg());
      return NextResponse.json({ morning: config.morning });
    }
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "morning_failed", detail: String(err) }, { status: 502 });
  }
}
