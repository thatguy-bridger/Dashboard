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
    color_temp_kelvin?: number;
    min_color_temp_kelvin?: number;
    max_color_temp_kelvin?: number;
    hs_color?: [number, number];
  };
}

/** Devices that stay ON when you leave (Wyze LED plugs). */
const KEEP_ON = /\bled\b/i;

const AWAY_ID = "home_base_before_leaving";
const AWAY_SCENE = `scene.${AWAY_ID}`;

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

/** Some integrations send names HTML-escaped (65&quot; TV). */
const unescapeName = (n: string) => n.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function toEntity(s: HaState, room: string): HomeEntity {
  const domain = s.entity_id.split(".")[0];
  const kind = DOMAINS[domain];
  const base = { id: s.entity_id, name: unescapeName(s.attributes.friendly_name ?? s.entity_id), kind, room, available: s.state !== "unavailable" };
  if (kind === "light") {
    const modes = s.attributes.supported_color_modes ?? [];
    const dimmable = modes.some((m) => m !== "onoff");
    const supportsColorTemp = modes.includes("color_temp");
    const supportsColor = modes.some((m) => ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(m));
    return {
      ...base,
      on: s.state === "on",
      dimmable,
      brightness: s.attributes.brightness != null ? Math.round((s.attributes.brightness / 255) * 100) : undefined,
      supportsColorTemp,
      supportsColor,
      colorTemp: s.attributes.color_temp_kelvin,
      minKelvin: s.attributes.min_color_temp_kelvin,
      maxKelvin: s.attributes.max_color_temp_kelvin,
      hs: s.attributes.hs_color,
    };
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

/** The Home Assistant service (and data) for one action on a given domain. */
function serviceFor(domain: string, action: HomeAction): { domain: string; service: string; data: Record<string, unknown> } | null {
  switch (action.type) {
    case "activate": return { domain: "scene", service: "turn_on", data: {} };
    case "toggle": return { domain, service: "toggle", data: {} };
    case "on": return { domain, service: "turn_on", data: {} };
    case "off": return { domain, service: "turn_off", data: {} };
    case "brightness": return { domain: "light", service: "turn_on", data: { brightness_pct: Math.max(1, Math.min(100, Math.round(action.value))) } };
    case "colorTemp": return { domain: "light", service: "turn_on", data: { color_temp_kelvin: Math.round(action.value) } };
    case "color": return { domain: "light", service: "turn_on", data: { hs_color: [Math.max(0, Math.min(360, action.h)), Math.max(0, Math.min(100, action.s))] } };
    case "volume": return { domain: "media_player", service: "volume_set", data: { volume_level: Math.max(0, Math.min(100, action.value)) / 100 } };
    case "play": return { domain: "media_player", service: "media_play", data: {} };
    case "pause": return { domain: "media_player", service: "media_pause", data: {} };
    case "next": return { domain: "media_player", service: "media_next_track", data: {} };
    case "previous": return { domain: "media_player", service: "media_previous_track", data: {} };
  }
}

export const homeAssistantProvider: HomeProvider = {
  name: "homeassistant",
  async snapshot(): Promise<HomeSnapshot> {
    const res = await fetch(`${URL_()}/api/states`, { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`Home Assistant responded ${res.status}`);
    const raw = (await res.json()) as HaState[];
    const away = raw.some((s) => s.entity_id === AWAY_SCENE);
    const people = raw.filter((s) => s.entity_id.startsWith("person.")).map((s) => ({ name: unescapeName(s.attributes.friendly_name ?? s.entity_id), home: s.state === "home" }));
    // the saved "before I left" scene is bookkeeping, not a button
    const all = raw.filter((s) => DOMAINS[s.entity_id.split(".")[0]] && s.entity_id !== AWAY_SCENE);
    const rooms = await areas(all.map((s) => s.entity_id));
    const entities = all.map((s) => {
      const kind = DOMAINS[s.entity_id.split(".")[0]];
      return toEntity(s, kind === "scene" ? "Scenes" : kind === "media" ? "Speakers" : rooms.get(s.entity_id) ?? "Other");
    });
    return { provider: "homeassistant", entities, away, ...(people.length ? { people } : {}) };
  },
  async leaveHome() {
    const raw = (await (await fetch(`${URL_()}/api/states`, { headers: headers(), cache: "no-store" })).json()) as HaState[];
    const armed = raw.some((s) => s.entity_id === AWAY_SCENE);
    const lights = raw.filter((s) => s.entity_id.startsWith("light.")).map((s) => s.entity_id);
    const switches = raw.filter((s) => s.entity_id.startsWith("switch.")).map((s) => s.entity_id);
    const stayOn = new Set(raw.filter((s) => KEEP_ON.test(s.attributes.friendly_name ?? "")).map((s) => s.entity_id));
    // Remember how things were, unless we're already away (a second press must not overwrite the memory with "all off").
    if (!armed && lights.length + switches.length > 0) await call("scene", "create", { scene_id: AWAY_ID, snapshot_entities: [...lights, ...switches] });
    const offLights = lights.filter((id) => !stayOn.has(id)), offSwitches = switches.filter((id) => !stayOn.has(id));
    if (offLights.length) await call("light", "turn_off", { entity_id: offLights });
    if (offSwitches.length) await call("switch", "turn_off", { entity_id: offSwitches });
    // the LED plugs are meant to be on while you're out
    const led = [...stayOn].filter((id) => id.startsWith("switch.") || id.startsWith("light."));
    if (led.length) { const byDomain = (d: string) => led.filter((id) => id.startsWith(`${d}.`)); for (const d of ["switch", "light"]) if (byDomain(d).length) await call(d, "turn_on", { entity_id: byDomain(d) }); }
    const playing = raw.filter((s) => s.entity_id.startsWith("media_player.") && s.state === "playing").map((s) => s.entity_id);
    if (playing.length) await call("media_player", "media_pause", { entity_id: playing });
  },
  async returnHome() {
    await call("scene", "turn_on", { entity_id: AWAY_SCENE });
    try { await call("scene", "delete", { entity_id: AWAY_SCENE }); } catch { /* an older Home Assistant keeps it; harmless but it would read as still away */ }
  },
  async peek(ids: string[]) {
    const out = await Promise.all(
      ids.slice(0, 20).filter((id) => DOMAINS[id.split(".")[0]]).map(async (id) => {
        const res = await fetch(`${URL_()}/api/states/${encodeURIComponent(id)}`, { headers: headers(), cache: "no-store" });
        if (!res.ok) return null;
        return toEntity((await res.json()) as HaState, "");
      })
    );
    return out.filter((e): e is HomeEntity => e !== null);
  },
  /** One service call per domain with every entity in it (what Home Assistant's own UI does),
   *  instead of one request per device, which cloud bulbs (Tuya) handle badly. */
  async actMany(ids: string[], action: HomeAction) {
    const byDomain = new Map<string, string[]>();
    for (const id of ids) {
      const d = id.split(".")[0];
      if (!DOMAINS[d]) throw new Error("unsupported device");
      byDomain.set(d, [...(byDomain.get(d) ?? []), id]);
    }
    for (const [domain, list] of byDomain) {
      const svc = serviceFor(domain, action);
      if (!svc) continue;
      await call(svc.domain, svc.service, { entity_id: list, ...svc.data });
    }
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
      case "colorTemp": return call("light", "turn_on", { entity_id: id, color_temp_kelvin: Math.round(action.value) });
      case "color": return call("light", "turn_on", { entity_id: id, hs_color: [Math.max(0, Math.min(360, action.h)), Math.max(0, Math.min(100, action.s))] });
      case "volume": return call("media_player", "volume_set", { entity_id: id, volume_level: Math.max(0, Math.min(100, action.value)) / 100 });
      case "play": return call("media_player", "media_play", { entity_id: id });
      case "pause": return call("media_player", "media_pause", { entity_id: id });
      case "next": return call("media_player", "media_next_track", { entity_id: id });
      case "previous": return call("media_player", "media_previous_track", { entity_id: id });
    }
  },
};

export interface BrowseItem {
  title: string;
  mediaId: string;
  mediaType: string;
  canPlay: boolean;
  canExpand: boolean;
  thumbnail?: string;
}

/** Media browsing only exists on Home Assistant's websocket API, so open one for a single request. */
function wsRequest<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${URL_().replace(/^http/, "ws")}/api/websocket`);
    const timer = setTimeout(() => { ws.close(); reject(new Error("Home Assistant websocket timed out")); }, 12000);
    const done = (fn: () => void) => { clearTimeout(timer); ws.close(); fn(); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: process.env.HOME_ASSISTANT_TOKEN }));
      else if (m.type === "auth_ok") ws.send(JSON.stringify({ id: 1, ...message }));
      else if (m.type === "auth_invalid") done(() => reject(new Error("Home Assistant rejected the token")));
      else if (m.type === "result" && m.id === 1) done(() => (m.success ? resolve(m.result as T) : reject(new Error(m.error?.message ?? "browse failed"))));
    };
    ws.onerror = () => done(() => reject(new Error("Home Assistant websocket error")));
  });
}

/** Children of a media-browser node on a player (no id = its top level). */
export async function browseMedia(entityId: string, mediaId?: string, mediaType?: string): Promise<{ title: string; children: BrowseItem[] }> {
  const r = await wsRequest<{ title?: string; children?: Record<string, unknown>[] }>({
    type: "media_player/browse_media",
    entity_id: entityId,
    ...(mediaId ? { media_content_id: mediaId, media_content_type: mediaType } : {}),
  });
  return {
    title: unescapeName(r.title ?? ""),
    children: (r.children ?? []).map((c) => ({
      title: unescapeName(String(c.title ?? "")),
      mediaId: String(c.media_content_id ?? ""),
      mediaType: String(c.media_content_type ?? ""),
      canPlay: Boolean(c.can_play),
      canExpand: Boolean(c.can_expand),
      thumbnail: typeof c.thumbnail === "string" ? c.thumbnail : undefined,
    })),
  };
}

export async function playMedia(entityId: string, mediaId: string, mediaType: string) {
  await call("media_player", "play_media", { entity_id: entityId, media_content_id: mediaId, media_content_type: mediaType });
}

/** Creates two Home Assistant scripts that do what the dashboard's "I'm leaving" / "I'm back" buttons do,
 *  so a Google Home routine ("hey google, I'm leaving") can run them (expose them to Google Assistant in
 *  Nabu Casa). Re-run after adding lights so the list stays current. */
export async function installAwayScripts(): Promise<string[]> {
  const raw = (await (await fetch(`${URL_()}/api/states`, { headers: headers(), cache: "no-store" })).json()) as HaState[];
  const ids = (d: string) => raw.filter((s) => s.entity_id.startsWith(`${d}.`)).map((s) => s.entity_id);
  const keep = new Set(raw.filter((s) => KEEP_ON.test(s.attributes.friendly_name ?? "")).map((s) => s.entity_id));
  const lights = ids("light"), switches = ids("switch");
  const offLights = lights.filter((i) => !keep.has(i)), offSwitches = switches.filter((i) => !keep.has(i));
  const ledOn = [...keep].filter((i) => i.startsWith("switch.") || i.startsWith("light."));
  const notArmed = `{{ states.scene | selectattr('entity_id','eq','${AWAY_SCENE}') | list | count == 0 }}`;
  const scripts: Record<string, unknown> = {
    home_base_leaving: {
      alias: "Home Base: I'm leaving",
      description: "Remembers which lights are on, turns everything off, pauses music. Home Base restores it when you return.",
      mode: "single",
      sequence: [
        { if: [{ condition: "template", value_template: notArmed }], then: [{ action: "scene.create", data: { scene_id: AWAY_ID, snapshot_entities: [...lights, ...switches] } }] },
        ...(offLights.length ? [{ action: "light.turn_off", target: { entity_id: offLights } }] : []),
        ...(offSwitches.length ? [{ action: "switch.turn_off", target: { entity_id: offSwitches } }] : []),
        ...(ledOn.length ? [{ action: "homeassistant.turn_on", target: { entity_id: ledOn } }] : []),
        { action: "media_player.media_pause", target: { entity_id: "all" }, continue_on_error: true },
      ],
    },
    home_base_returning: {
      alias: "Home Base: I'm back",
      description: "Puts the lights back the way they were before 'I'm leaving'.",
      mode: "single",
      sequence: [
        { action: "scene.turn_on", target: { entity_id: AWAY_SCENE }, continue_on_error: true },
        { action: "scene.delete", target: { entity_id: AWAY_SCENE }, continue_on_error: true },
      ],
    },
  };
  for (const [id, body] of Object.entries(scripts)) {
    const res = await fetch(`${URL_()}/api/config/script/config/${id}`, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store" });
    if (!res.ok) throw new Error(`couldn't create script ${id} (${res.status})`);
  }
  return Object.keys(scripts).map((k) => `script.${k}`);
}
