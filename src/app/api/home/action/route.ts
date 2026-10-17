import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider, runScene, type HomeAction } from "@/lib/smarthome";
import { getHomeConfig } from "@/lib/smarthome/config";

const SIMPLE = new Set(["toggle", "on", "off", "activate", "play", "pause", "next", "previous"]);
const VALUED = new Set(["brightness", "volume", "colorTemp", "speed"]);

/** Body: { id } or { ids: [...] } plus { action }. Saved scenes use id "custom:<sceneId>". */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

  const body = await req.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown): x is string => typeof x === "string").slice(0, 40) : typeof body.id === "string" ? [body.id] : [];
  const a = body.action;
  let action: HomeAction | null = null;
  if (a && SIMPLE.has(a.type)) action = { type: a.type };
  else if (a && VALUED.has(a.type) && typeof a.value === "number") action = { type: a.type, value: a.value };
  else if (a && a.type === "color" && typeof a.h === "number" && typeof a.s === "number") action = { type: "color", h: a.h, s: a.s };
  if (ids.length === 0 || !action) return NextResponse.json({ error: "bad request" }, { status: 400 });

  try {
    const provider = getProvider();
    for (const id of ids) {
      if (id.startsWith("custom:") && action.type === "activate") {
        const scene = (await getHomeConfig()).scenes.find((s) => s.id === id.slice(7));
        if (!scene) return NextResponse.json({ error: "unknown scene" }, { status: 404 });
        await runScene(scene.lights);
      }
    }
    const direct = ids.filter((id) => !id.startsWith("custom:"));
    if (direct.length === 1) await provider.act(direct[0], action);
    else if (direct.length > 1) {
      if (provider.actMany) await provider.actMany(direct, action);
      else await Promise.all(direct.map((id) => provider.act(id, action!)));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "action_failed", detail: String(err) }, { status: 502 });
  }
}
