import { NextRequest, NextResponse } from "next/server";
import { checkPin, getProvider, lightStates } from "@/lib/smarthome";
import { getHomeConfig, saveHomeConfig } from "@/lib/smarthome/config";

const deny = (gate: string) => NextResponse.json({ error: gate }, { status: gate === "pin_not_configured" ? 403 : 401 });

/** Save the lights exactly as they are right now as a named scene: { name }. */
export async function POST(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  const { name } = await req.json();
  if (typeof name !== "string" || !name.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const config = await getHomeConfig();
  if (config.scenes.length >= 40) return NextResponse.json({ error: "too many scenes" }, { status: 400 });
  const snap = await getProvider().snapshot();
  const scene = { id: Math.random().toString(36).slice(2, 10), name: name.trim().slice(0, 40), lights: lightStates(snap.entities.filter((e) => !config.hidden.includes(e.id))) };
  await saveHomeConfig({ ...config, scenes: [...config.scenes, scene] });
  return NextResponse.json({ scene });
}

export async function DELETE(req: NextRequest) {
  const gate = checkPin(req.headers.get("x-control-pin"));
  if (gate !== "ok") return deny(gate);
  const id = req.nextUrl.searchParams.get("id");
  const config = await getHomeConfig();
  await saveHomeConfig({ ...config, scenes: config.scenes.filter((s) => s.id !== id) });
  return NextResponse.json({ ok: true });
}
