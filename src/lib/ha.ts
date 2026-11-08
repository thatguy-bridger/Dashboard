export type Device = {
  id: string; name: string; kind: "light" | "plug" | "fan" | "media" | "display"; room: string; on: boolean;
  brightness?: number; dimmable: boolean; supportsColor?: boolean; kelvin?: number; kelvinRange?: [number, number];
  percentage?: number; speedCount?: number; oscillating?: boolean; direction?: string; presets?: string[]; preset?: string;
  playing?: boolean; volume?: number; title?: string; artist?: string;
};
export type Home = { configured: boolean; reachable: boolean; devices: Device[]; away: boolean; musicLights: boolean; rooms: string[] };

const base = () => (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/+$/, "");
const token = () => process.env.HOME_ASSISTANT_TOKEN ?? "";
export const haConfigured = () => !!base() && !!token();

async function ha(method: string, path: string, body?: unknown) {
  return fetch(base() + path, {
    method, cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

type State = { entity_id: string; state: string; attributes: Record<string, any> };

function device(s: State): Device | null {
  const [domain] = s.entity_id.split(".");
  const a = s.attributes ?? {};
  const name: string = a.friendly_name ?? s.entity_id;
  if (s.state === "unavailable") return null;
  const screen = /\b(information|display|screen|monitor)\b/i.test(name);
  if (domain === "light") {
    const modes: string[] = a.supported_color_modes ?? [];
    const d: Device = { id: s.entity_id, name, kind: "light", room: "", on: s.state === "on", brightness: a.brightness != null ? a.brightness / 255 : undefined, dimmable: modes.some((m) => m !== "onoff"), supportsColor: modes.some((m) => ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(m)) };
    if (modes.includes("color_temp") && a.min_color_temp_kelvin && a.max_color_temp_kelvin) { d.kelvinRange = [a.min_color_temp_kelvin, a.max_color_temp_kelvin]; d.kelvin = a.color_temp_kelvin; }
    return d;
  }
  if (domain === "switch") return { id: s.entity_id, name, kind: screen ? "display" : "plug", room: "", on: s.state === "on", dimmable: false };
  if (domain === "fan") {
    const f = Number(a.supported_features ?? 0);
    const d: Device = { id: s.entity_id, name, kind: "fan", room: "", on: s.state === "on", dimmable: false, presets: a.preset_modes ?? [], preset: a.preset_mode };
    if (f & 1 || a.percentage != null) { d.percentage = (a.percentage ?? 0) / 100; d.speedCount = Math.max(1, Math.round(100 / Math.max(a.percentage_step ?? 1, 0.5))); }
    if (f & 2 || a.oscillating != null) d.oscillating = !!a.oscillating;
    if (f & 4 || a.direction != null) d.direction = a.direction;
    return d;
  }
  if (domain === "media_player") return { id: s.entity_id, name, kind: "media", room: "Speakers", on: s.state !== "off", dimmable: false, playing: s.state === "playing", volume: a.volume_level, title: a.media_title, artist: a.media_artist };
  return null;
}

export async function home(): Promise<Home> {
  const empty: Home = { configured: haConfigured(), reachable: false, devices: [], away: false, musicLights: false, rooms: [] };
  if (!haConfigured()) return empty;
  try {
    const res = await ha("GET", "/api/states");
    if (!res.ok) return empty;
    const states: State[] = await res.json();
    const devices = states.map(device).filter((d): d is Device => !!d);
    const ids = devices.filter((d) => d.kind !== "media").map((d) => d.id);
    const tpl = `{% for e in ${JSON.stringify(ids)} %}{{ e }}|{{ area_name(e) or '' }}\n{% endfor %}`;
    const areas = new Map<string, string>();
    try {
      const t = await ha("POST", "/api/template", { template: tpl });
      if (t.ok) for (const line of (await t.text()).split("\n")) { const [id, area] = line.split("|"); if (id && area) areas.set(id.trim(), area.trim()); }
    } catch {}
    for (const d of devices) if (d.kind !== "media") d.room = areas.get(d.id) ?? "Other";
    const on = (id: string) => states.find((s) => s.entity_id === id)?.state === "on";
    const rooms = [...new Set(devices.filter((d) => d.kind === "light" || d.kind === "plug").map((d) => d.room))].sort();
    devices.sort((a, b) => (a.room + a.name).localeCompare(b.room + b.name));
    return { configured: true, reachable: true, devices, away: states.some((s) => s.entity_id === "scene.home_base_before_leaving"), musicLights: on("input_boolean.home_base_music_lights"), rooms };
  } catch { return { ...empty, configured: true }; }
}

export async function call(domain: string, service: string, data: Record<string, unknown>) {
  const res = await ha("POST", `/api/services/${domain}/${service}`, data);
  return res.ok;
}
