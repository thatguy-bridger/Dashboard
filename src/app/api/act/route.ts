import { allowed, deny, pinOf } from "@/lib/auth";
import { call } from "@/lib/ha";
import { enqueue } from "@/lib/supabase";

type Body = { op: string; id?: string; ids?: string[]; on?: boolean; pct?: number; k?: number; level?: number; action?: string; name?: string; cmd?: Record<string, unknown> };

export async function POST(req: Request) {
  if (!(await allowed(req))) return deny();
  const b = (await req.json()) as Body;
  const dom = (id: string) => id.split(".")[0];
  let ok = false;
  switch (b.op) {
    case "toggle": if (b.id) ok = await call(dom(b.id), b.on ? "turn_on" : "turn_off", { entity_id: b.id }); break;
    case "many": if (b.ids?.length) {
      const by = new Map<string, string[]>();
      for (const id of b.ids) by.set(dom(id), [...(by.get(dom(id)) ?? []), id]);
      ok = (await Promise.all([...by].map(([d, ids]) => call(d, b.on ? "turn_on" : "turn_off", { entity_id: ids })))).every(Boolean);
    } break;
    case "brightness": if (b.ids?.length && b.pct != null) ok = await call("light", "turn_on", { entity_id: b.ids, brightness_pct: Math.round(b.pct) }); break;
    case "kelvin": if (b.id && b.k) ok = await call("light", "turn_on", { entity_id: b.id, color_temp_kelvin: Math.round(b.k) }); break;
    case "fan": if (b.id && b.pct != null) ok = b.pct <= 0 ? await call("fan", "turn_off", { entity_id: b.id }) : await call("fan", "set_percentage", { entity_id: b.id, percentage: Math.round(b.pct) }); break;
    case "oscillate": if (b.id) ok = await call("fan", "oscillate", { entity_id: b.id, oscillating: !!b.on }); break;
    case "direction": if (b.id && b.name) ok = await call("fan", "set_direction", { entity_id: b.id, direction: b.name }); break;
    case "preset": if (b.id && b.name) ok = await call("fan", "set_preset_mode", { entity_id: b.id, preset_mode: b.name }); break;
    case "media": if (b.id && b.action) ok = await call("media_player", b.action === "next" ? "media_next_track" : b.action === "previous" ? "media_previous_track" : b.action === "pause" ? "media_pause" : "media_play", { entity_id: b.id }); break;
    case "volume": if (b.id && b.level != null) ok = await call("media_player", "volume_set", { entity_id: b.id, volume_level: b.level }); break;
    case "musicLights": ok = await call("input_boolean", b.on ? "turn_on" : "turn_off", { entity_id: "input_boolean.home_base_music_lights" }); break;
    case "scene":
      if (b.name === "night") ok = await call("script", "turn_on", { entity_id: "script.home_base_night", variables: { volume: 20 } });
      if (b.name === "leaving") ok = await call("script", "turn_on", { entity_id: "script.home_base_leaving" });
      if (b.name === "returning") ok = await call("script", "turn_on", { entity_id: "script.home_base_returning" });
      break;
    case "permuta": if (b.cmd) { await enqueue(pinOf(req), b.cmd); ok = true; } break;   // things only Permuta can do (Spotify playlists, …)
  }
  return Response.json({ ok }, { status: ok ? 200 : 502 });
}
