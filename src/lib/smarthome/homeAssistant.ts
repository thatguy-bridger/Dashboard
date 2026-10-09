import type { HomeAction, HomeEntity, HomeKind, HomeProvider, HomeSnapshot } from "./types";

const URL_ = () => (process.env.HOME_ASSISTANT_URL ?? "").replace(/\/+$/, "");
const headers = () => ({ Authorization: `Bearer ${process.env.HOME_ASSISTANT_TOKEN}`, "Content-Type": "application/json" });

interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown> & {
    friendly_name?: string;
    brightness?: number;
    supported_color_modes?: string[];
    volume_level?: number;
    media_title?: string;
  };
}

const DOMAINS: Record<string, HomeKind> = { light: "light", switch: "switch", scene: "scene", media_player: "media" };

/** Home Assistant doesn't put the room (area) in /api/states; one template call looks them all up. */
async function areas(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const template = `{% for e in ${JSON.stringify(ids)} %}{{ e }}|{{ area_name(e) or '' }}\n{% endfor %}`;
    const res = await fetch(`${URL_()}/api/template`, { method: "POST", headers: headers(), body: JSON.stringify({ template }), cache: "no-store" });
    if (!res.ok) return out;
    for (const line of (await res.text()).split("\n")) {
      const [id, area] = line.split("|");
      if (id && area) out.set(id.trim(), area.trim());
    }
  } catch {
    // rooms are a nicety; fall back to "Other"
  }
  return out;
}

function toEntity(s: HaState, room: string): HomeEntity {
  const domain = s.entity_id.split(".")[0];
  const kind = DOMAINS[domain];
  const base = { id: s.entity_id, name: s.attributes.friendly_name ?? s.entity_id, kind, room, available: s.state !== "unavailable" };
  if (kind === "light") {
    const modes = s.attributes.supported_color_modes ?? [];
    const dimmable = modes.some((m) => m !== "onoff");
    return { ...base, on: s.state === "on", dimmable, brightness: s.attributes.brightness != null ? Math.round((s.attributes.brightness / 255) * 100) : undefined };
  }
  if (kind === "switch") return { ...base, on: s.state === "on" };
  if (kind === "media") {
    return {
      ...base,
      on: s.state !== "off" && s.state !== "unavailable",
      playing: s.state === "playing",
      volume: s.attributes.volume_level != null ? Math.round(s.attributes.volume_level * 100) : null,
      title: s.attributes.media_title ?? null,
    };
  }
  return base as HomeEntity;
}

async function call(domain: string, service: string, data: Record<string, unknown>) {
  const res = await fetch(`${URL_()}/api/services/${domain}/${service}`, { method: "POST", headers: headers(), body: JSON.stringify(data), cache: "no-store" });
  if (!res.ok) throw new Error(`Home Assistant ${domain}.${service} failed (${res.status})`);
}

export const homeAssistantProvider: HomeProvider = {
  name: "homeassistant",
  async snapshot(): Promise<HomeSnapshot> {
    const res = await fetch(`${URL_()}/api/states`, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`Home Assistant responded ${res.status}`);
    const all = ((await res.json()) as HaState[]).filter((s) => DOMAINS[s.entity_id.split(".")[0]]);
    const rooms = await areas(all.map((s) => s.entity_id));
    const entities = all.map((s) => {
      const kind = DOMAINS[s.entity_id.split(".")[0]];
      return toEntity(s, kind === "scene" ? "Scenes" : kind === "media" ? "Speakers" : rooms.get(s.entity_id) ?? "Other");
    });
    return { provider: "homeassistant", entities };
  },
  async act(id: string, action: HomeAction) {
    const domain = id.split(".")[0];
    if (!DOMAINS[domain]) throw new Error("unsupported device");
    switch (action.type) {
      case "activate": return call("scene", "turn_on", { entity_id: id });
      case "toggle": return call(domain === "media_player" ? "media_player" : domain, "toggle", { entity_id: id });
      case "on": return call(domain, "turn_on", { entity_id: id });
      case "off": return call(domain, "turn_off", { entity_id: id });
      case "brightness": return call("light", "turn_on", { entity_id: id, brightness_pct: Math.max(1, Math.min(100, Math.round(action.value))) });
      case "volume": return call("media_player", "volume_set", { entity_id: id, volume_level: Math.max(0, Math.min(100, action.value)) / 100 });
      case "play": return call("media_player", "media_play", { entity_id: id });
      case "pause": return call("media_player", "media_pause", { entity_id: id });
      case "next": return call("media_player", "media_next_track", { entity_id: id });
      case "previous": return call("media_player", "media_previous_track", { entity_id: id });
    }
  },
};
