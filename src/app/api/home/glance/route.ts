import { NextRequest, NextResponse } from "next/server";
import { checkPin, homeSnapshot, haConfigured } from "@/lib/smarthome";
import { getDevice } from "@/lib/registry";

/** A read-only summary of the house for the StandBy screens. Allowed with the Control PIN or from a screen you've
 *  approved as a device; anyone else with the URL gets nothing (it says who is home). */
export async function GET(req: NextRequest) {
  const pinOk = checkPin(req.headers.get("x-control-pin")) === "ok" && (haConfigured() ? Boolean(req.headers.get("x-control-pin")) : true);
  let allowed = pinOk;
  if (!allowed) {
    const id = req.headers.get("x-device-id");
    const dev = id ? await getDevice(id).catch(() => null) : null;
    allowed = dev?.status === "approved";
  }
  if (!allowed) return NextResponse.json({ error: "not_allowed" }, { status: 401 });
  try {
    const snap = await homeSnapshot();
    const e = snap.entities;
    const lights = e.filter((x) => x.kind === "light").map((x) => ({ id: x.id, name: x.name, room: x.room, on: Boolean(x.on), hs: x.hs, colorTemp: x.colorTemp, brightness: x.brightness }));
    return NextResponse.json({
      provider: snap.provider,
      lights,
      plugs: e.filter((x) => x.kind === "switch").map((x) => ({ name: x.name, on: Boolean(x.on) })),
      fans: e.filter((x) => x.kind === "fan").map((x) => ({ name: x.name, on: Boolean(x.on), speed: x.speed ?? 0, steps: x.speedSteps ?? 6 })),
      media: e.filter((x) => x.kind === "media").map((x) => ({ name: x.name, playing: Boolean(x.playing), on: Boolean(x.on), title: x.title ?? null, volume: x.volume ?? null })),
      timers: Object.entries(snap.timers ?? {}).map(([id, t]) => ({ name: e.find((x) => x.id === id)?.name ?? id, endsAt: t.endsAt, action: t.action })),
      people: snap.people ?? [],
      away: Boolean(snap.away),
      guest: Boolean(snap.guest?.active),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: "provider_failed", detail: String(err) }, { status: 502 });
  }
}
