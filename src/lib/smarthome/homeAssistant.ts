import type { HomeAction, HomeEntity, HomeKind, HomeProvider, HomeSnapshot, MorningConfig } from "./types";

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
    percentage?: number;
    percentage_step?: number;
  };
}

/** Devices that stay ON when you leave (Wyze LED plugs). */
const KEEP_ON = /\bled\b/i;

const AWAY_ID = "home_base_before_leaving";
const AWAY_SCENE = `scene.${AWAY_ID}`;

/** Screens that happen to be powered by a smart plug: they are displays, not lights, so they stay out of the light counts. */
const DISPLAY_NAME = /\b(information|display|screen|monitor)\b/i;

const DOMAINS: Record<string, HomeKind> = { light: "light", switch: "switch", scene: "scene", media_player: "media", fan: "fan" };

/** Home Assistant doesn't put the room (area) in /api/states; one template call looks them all up. */
let areaCache: { at: number; key: string; map: Map<string, string> } | null = null;
async function areas(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  // rooms almost never change: reuse the last answer for 5 minutes while the device list is the same
  const key = ids.join(",");
  if (areaCache && areaCache.key === key && Date.now() - areaCache.at < 5 * 60_000) return areaCache.map;
  try {
    const template = `{% for e in ${JSON.stringify(ids)} %}{{ e }}|{{ area_name(e) or '' }}\n{% endfor %}`;
    const res = await fetch(`${URL_()}/api/template`, { method: "POST", headers: headers(), body: JSON.stringify({ template }), cache: "no-store" });
    if (!res.ok) return out;
    for (const line of (await res.text()).split("\n")) {
      const [id, area] = line.split("|");
      if (id && area) out.set(id.trim(), area.trim());
    }
    areaCache = { at: Date.now(), key, map: out };
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
  if (kind === "switch") return { ...base, kind: DISPLAY_NAME.test(base.name) ? "display" : "switch", on: s.state === "on" };
  if (kind === "fan") {
    const step = s.attributes.percentage_step;
    return { ...base, on: s.state === "on", speed: s.state === "on" ? Math.round(s.attributes.percentage ?? 0) : 0, speedSteps: step && step > 0 ? Math.max(1, Math.round(100 / step)) : 3 };
  }
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
    case "color": return { domain: "light", service: "turn_on", data: { hs_color: [Math.max(0, Math.min(360, action.h)), Math.max(0, Math.min(100, action.s))], ...(action.brightness != null ? { brightness_pct: Math.max(1, Math.min(100, Math.round(action.brightness))) } : {}) } };
    case "speed": return { domain: "fan", service: "set_percentage", data: { percentage: Math.max(0, Math.min(100, Math.round(action.value))) } };
    case "volume": return { domain: "media_player", service: "volume_set", data: { volume_level: Math.max(0, Math.min(100, action.value)) / 100 } };
    case "play": return { domain: "media_player", service: "media_play", data: {} };
    case "pause": return { domain: "media_player", service: "media_pause", data: {} };
    case "next": return { domain: "media_player", service: "media_next_track", data: {} };
    case "previous": return { domain: "media_player", service: "media_previous_track", data: {} };
  }
}

async function leaveHomeSlow(keepOn: string[] = []) {
  const raw = (await (await fetch(`${URL_()}/api/states`, { headers: headers(), cache: "no-store" })).json()) as HaState[];
  const armed = raw.some((s) => s.entity_id === AWAY_SCENE);
  const lights = raw.filter((s) => s.entity_id.startsWith("light.") && s.state !== "unavailable").map((s) => s.entity_id);
  const switches = raw.filter((s) => s.entity_id.startsWith("switch.") && s.state !== "unavailable").map((s) => s.entity_id);
  const stayOn = new Set(raw.filter((s) => KEEP_ON.test(s.attributes.friendly_name ?? "") || keepOn.includes(s.entity_id)).map((s) => s.entity_id));
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
    // lights and plugs that are powered off or disconnected are left out entirely until they come back
    const gone = (s: HaState) => s.state === "unavailable" && /^(light|switch|fan)\./.test(s.entity_id);
    const all = raw.filter((s) => DOMAINS[s.entity_id.split(".")[0]] && s.entity_id !== AWAY_SCENE && !gone(s));
    const rooms = await areas(all.map((s) => s.entity_id));
    const entities = all.map((s) => {
      const kind = DOMAINS[s.entity_id.split(".")[0]];
      return toEntity(s, kind === "scene" ? "Scenes" : kind === "media" ? "Speakers" : rooms.get(s.entity_id) ?? "Other");
    });
    return { provider: "homeassistant", entities, away, ...(people.length ? { people } : {}) };
  },
  /** One Home Assistant call: the "I'm leaving" script does the rest locally (pause music, remember, turn off, LEDs on). */
  async leaveHome(keepOn: string[] = []) {
    try {
      await call("script", "turn_on", { entity_id: "script.home_base_leaving" });
    } catch {
      // script missing (not installed yet): do it step by step
      await leaveHomeSlow(keepOn);
    }
  },
  async startTimer(id: string, minutes: number, action: "on" | "off") { await startDeviceTimer(id, minutes, action); },
  async fade(id: string, frames: FadeFrame[], startInSeconds: number) { await runFade(id, frames, startInSeconds); },
  async stopFade(id: string) { await stopFade(id); },
  async cancelTimer(id: string) { await cancelDeviceTimer(id); },
  async returnHome() {
    try {
      await call("script", "turn_on", { entity_id: "script.home_base_returning" });
    } catch {
      await call("scene", "turn_on", { entity_id: AWAY_SCENE });
      try { await call("scene", "delete", { entity_id: AWAY_SCENE }); } catch { /* an older Home Assistant keeps it */ }
    }
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
      case "color": return call("light", "turn_on", { entity_id: id, hs_color: [Math.max(0, Math.min(360, action.h)), Math.max(0, Math.min(100, action.s))], ...(action.brightness != null ? { brightness_pct: Math.max(1, Math.min(100, Math.round(action.brightness))) } : {}) });
      case "speed": return call("fan", "set_percentage", { entity_id: id, percentage: Math.max(0, Math.min(100, Math.round(action.value))) });
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
export async function installAwayScripts(keepOn: string[] = []): Promise<string[]> {
  const raw = (await (await fetch(`${URL_()}/api/states`, { headers: headers(), cache: "no-store" })).json()) as HaState[];
  const ids = (d: string) => raw.filter((s) => s.entity_id.startsWith(`${d}.`) && s.state !== "unavailable").map((s) => s.entity_id);
  const keep = new Set(raw.filter((s) => KEEP_ON.test(s.attributes.friendly_name ?? "") || keepOn.includes(s.entity_id)).map((s) => s.entity_id));
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
        // Music and lights are separate branches: slow or unreachable speakers (TVs, cast groups) must never hold up the lights.
        { parallel: [
          { action: "media_player.media_pause", target: { entity_id: "all" }, continue_on_error: true },
          { sequence: [
            // remember how things were (instant, local)...
            { if: [{ condition: "template", value_template: notArmed }], then: [{ action: "scene.create", data: { scene_id: AWAY_ID, snapshot_entities: [...lights, ...switches] } }] },
            // ...then everything goes off together
            { parallel: [
              ...(offLights.length ? [{ action: "light.turn_off", target: { entity_id: offLights } }] : []),
              ...(offSwitches.length ? [{ action: "switch.turn_off", target: { entity_id: offSwitches } }] : []),
              ...(ledOn.length ? [{ action: "homeassistant.turn_on", target: { entity_id: ledOn } }] : []),
            ] },
          ] },
        ] },
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

/** The Home Assistant app on each phone/tablet shows up as a notify.mobile_app_* service. */
export async function mobileAppServices(): Promise<string[]> {
  const res = await fetch(`${URL_()}/api/services`, { headers: headers(), cache: "no-store" });
  if (!res.ok) return [];
  const all = (await res.json()) as { domain: string; services: Record<string, unknown> }[];
  return Object.keys(all.find((d) => d.domain === "notify")?.services ?? {}).filter((s) => s.startsWith("mobile_app_"));
}

/** Home Assistant app commands (screen on, brightness...): a "notification" whose message is the command. */
export async function tabletCommand(service: string, message: string, data?: Record<string, unknown>) {
  await call("notify", service, { message, ...(data ? { data } : {}) });
}

/** Any Home Assistant motion / occupancy / presence sensor (a motion sensor, the IP Webcam app, mmWave...).
 *  `since` is when the most recent one turned on (ms), so the screen can wake on a fresh trigger only. */
let motionCache: { at: number; value: { sensors: number; active: boolean; since: number } } | null = null;
export async function motionState(fresh = false): Promise<{ sensors: number; active: boolean; since: number }> {
  if (!fresh && motionCache && Date.now() - motionCache.at < 1500) return motionCache.value;
  // A template returns only the few sensors we care about (a few bytes), instead of every entity in the house.
  const template = `{% set ns = namespace(n=0, on=0, since=0) %}{% for s in states.binary_sensor if s.attributes.device_class in ['motion','occupancy','presence'] %}{% set ns.n = ns.n + 1 %}{% if s.state == 'on' %}{% set ns.on = ns.on + 1 %}{% set lm = as_timestamp(s.attributes.last_motion, 0) %}{% set ns.since = [ns.since, lm if lm > 0 else as_timestamp(s.last_changed)] | max %}{% endif %}{% endfor %}{{ ns.n }}|{{ ns.on }}|{{ ns.since }}`;
  const res = await fetch(`${URL_()}/api/template`, { method: "POST", headers: headers(), body: JSON.stringify({ template }), cache: "no-store" });
  if (!res.ok) throw new Error(`Home Assistant responded ${res.status}`);
  const [n, on, since] = (await res.text()).trim().split("|");
  const value = { sensors: Number(n) || 0, active: Number(on) > 0, since: Math.round((Number(since) || 0) * 1000) };
  motionCache = { at: Date.now(), value };
  return value;
}

/** The tablet's whole presence behaviour, run by Home Assistant itself (it watches the camera's motion sensor and talks to
 *  the tablet app directly), so none of it costs the dashboard a single request:
 *   - motion: wake the screen and restore brightness (unless it's night and every light is off);
 *   - no motion for 5 seconds: dim in five steps, screen off at 20 seconds;
 *   - away for over a minute and motion/your phone shows up: the lights return and the music resumes. */
export async function installMotionWake(service: string, awake: number) {
  const n = (message: string, data?: Record<string, unknown>) => ({ action: `notify.${service}`, data: { message, ...(data ? { data } : {}) } });
  const awakeSteps = [n("command_screen_on"), n("command_screen_brightness_level", { command: awake })];
  const raw = (await (await fetch(`${URL_()}/api/states`, { headers: headers(), cache: "no-store" })).json()) as HaState[];
  const people = raw.filter((p) => p.entity_id.startsWith("person."));
  const owner = (people.find((p) => /bridger/i.test(p.attributes.friendly_name ?? "")) ?? people[0])?.entity_id ?? null;
  const awayArmed = `{% set s = states.scene | selectattr('entity_id','eq','${AWAY_SCENE}') | list %}{{ s | count > 0 }}`;
  const awayLong = `{% set s = states.scene | selectattr('entity_id','eq','${AWAY_SCENE}') | list %}{{ s | count > 0 and (now() - s[0].last_updated).total_seconds() > 60 }}`;
  const comeBack = [
    { action: "script.turn_on", target: { entity_id: "script.home_base_returning" } },
    ...awakeSteps,
    { action: "rest_command.home_base_hook", data: { do: "resume_music" }, continue_on_error: true },
  ];
  const post = async (kind: "automation" | "script", id: string, body: unknown) => {
    const res = await fetch(`${URL_()}/api/config/${kind}/config/${id}`, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store" });
    if (!res.ok) throw new Error(`couldn't create ${kind} ${id} (${res.status})`);
  };
  // the dimming sequence: starts a little under the awake level and steps down every 3s (the same proportions as before: 76%, 56%, 35%, 18%), screen off at the end (20s after the last movement)
  await post("script", "home_base_dim", {
    alias: "Home Base: dim the tablet",
    mode: "restart",
    sequence: [
      n("command_auto_screen_brightness", { command: "turn_off" }),
      ...[0.76, 0.56, 0.35, 0.18].map((r) => Math.max(2, Math.round(awake * r))).concat(1).flatMap((level) => [n("command_screen_brightness_level", { command: level }), { delay: { seconds: 3 } }]),
      n("command_screen_off"),
    ],
  });
  await post("automation", "home_base_wake_on_motion", {
    alias: "Home Base: wake tablet on motion",
    description: "Movement in front of the tablet stops any dimming and wakes the screen; after being away it also brings the lights and music back.",
    mode: "single",
    triggers: [{ trigger: "state", entity_id: "binary_sensor.tablet_camera_motion", to: "on" }],
    actions: [
      { action: "script.turn_off", target: { entity_id: "script.home_base_dim" } },
      { parallel: [
        // wake the screen, unless it's night and every light is off (then the room should stay dark)
        { if: [{ condition: "template", value_template: "{{ not ((now().hour >= 21 or now().hour < 5) and (states.light | selectattr('state','eq','on') | list | count == 0)) }}" }], then: awakeSteps },
        // away and it's been a minute (so walking out the door doesn't count): you're back
        { if: [{ condition: "template", value_template: awayLong }], then: comeBack },
      ] },
    ],
  });
  await post("automation", "home_base_dim_when_idle", {
    alias: "Home Base: dim tablet when nobody is around",
    description: "5 seconds with no movement starts a slow dim; the screen is off 20 seconds in.",
    mode: "restart",
    triggers: [{ trigger: "state", entity_id: "binary_sensor.tablet_camera_motion", to: "off", for: { seconds: 5 } }],
    actions: [{ action: "script.turn_on", target: { entity_id: "script.home_base_dim" } }],
  });
  if (owner) {
    await post("automation", "home_base_arrive", {
      alias: "Home Base: you're home",
      description: "When your phone arrives home after 'I'm leaving', the lights come back and the music resumes.",
      mode: "single",
      triggers: [{ trigger: "state", entity_id: owner, to: "home" }],
      conditions: [{ condition: "template", value_template: awayArmed }],
      actions: comeBack,
    });
  }
  return { owner };
}

/** The tablet's battery from the Home Assistant app's sensors (sensor.<device>_battery_level / _battery_state). */
export async function tabletBattery(device: string): Promise<{ level: number | null; charging: boolean }> {
  const get = async (id: string) => {
    const res = await fetch(`${URL_()}/api/states/${id}`, { headers: headers(), cache: "no-store" });
    return res.ok ? ((await res.json()) as HaState).state : null;
  };
  const [level, state] = await Promise.all([get(`sensor.${device}_battery_level`), get(`sensor.${device}_battery_state`)]);
  const n = Number(level);
  return { level: level != null && Number.isFinite(n) ? n : null, charging: state === "charging" || state === "full" };
}

const timerScript = (id: string) => `hb_timer_${id.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`;

/** A one-off Home Assistant script per device: wait, then turn it on/off. Creating it each time sets the delay;
 *  mode "restart" means starting it again replaces a running timer. */
export async function startDeviceTimer(id: string, minutes: number, action: "on" | "off") {
  const name = timerScript(id);
  const mins = Math.max(1, Math.round(minutes));
  const body = {
    alias: `Home Base timer: ${id}`,
    mode: "restart",
    sequence: [
      { delay: { hours: Math.floor(mins / 60), minutes: mins % 60, seconds: 0 } },
      { action: `homeassistant.turn_${action}`, target: { entity_id: id } },
    ],
  };
  const res = await fetch(`${URL_()}/api/config/script/config/${name}`, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`couldn't create the timer (${res.status})`);
  await call("script", "turn_on", { entity_id: `script.${name}` });
}

export async function cancelDeviceTimer(id: string) {
  await call("script", "turn_off", { entity_id: `script.${timerScript(id)}` });
}

/** Who's home, from Home Assistant's person entities (each person's phone location). */
export async function peopleHome(): Promise<{ name: string; home: boolean }[]> {
  const template = "{% for p in states.person %}{{ p.name }}|{{ p.state }}\n{% endfor %}";
  const res = await fetch(`${URL_()}/api/template`, { method: "POST", headers: headers(), body: JSON.stringify({ template }), cache: "no-store" });
  if (!res.ok) throw new Error(`Home Assistant responded ${res.status}`);
  return (await res.text()).split("\n").filter(Boolean).map((l) => { const [name, state] = l.split("|"); return { name: unescapeName(name.trim()), home: state?.trim() === "home" }; });
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Creates (or removes) the Home Assistant automation for the morning wake-up. Home Assistant counts the minutes itself, so
 *  it runs whether or not the tablet is on. The music step calls rest_command.home_base_hook, a link back to this app. */
export async function installMorning(m: MorningConfig, tablet: { service: string | null; awake: number }) {
  const url = `${URL_()}/api/config/automation/config/home_base_morning`;
  if (!m.enabled) {
    await fetch(url, { method: "DELETE", headers: headers(), cache: "no-store" }).catch(() => {});
    return;
  }
  const steps = Math.max(2, m.minutes * 2); // a step every 30 seconds
  const target = { entity_id: m.lightIds.length ? m.lightIds : "all" };
  const branches: unknown[] = [];
  if (m.tablet && tablet.service) {
    branches.push({ sequence: [
      { action: `notify.${tablet.service}`, data: { message: "command_screen_on" } },
      { action: `notify.${tablet.service}`, data: { message: "command_screen_brightness_level", data: { command: tablet.awake } } },
    ] });
  }
  // the sunrise: brightness climbs and the white warms from candlelight to daylight, every 30 seconds
  branches.push({ repeat: { count: steps, sequence: [
    { action: "light.turn_on", target, data: { brightness_pct: `{{ [1, ((repeat.index / ${steps}) * 100) | round(0) | int] | max }}`, color_temp_kelvin: `{{ (2200 + (repeat.index / ${steps}) * 2300) | int }}` } },
    { delay: { seconds: 30 } },
  ] } });
  if (m.fanSpeed != null) branches.push({ sequence: [{ delay: { minutes: Math.round(m.minutes / 2) } }, { action: "fan.set_percentage", target: { entity_id: "all" }, data: { percentage: m.fanSpeed } }] });
  if (m.music) branches.push({ sequence: [{ delay: { minutes: Math.round(m.minutes * 0.6) } }, { action: "rest_command.home_base_hook", data: { do: "morning_music" }, continue_on_error: true }] });
  const body = {
    alias: "Home Base: morning wake-up",
    description: "Sunrise on the lights, then fan, music and the tablet. Managed from the tablet's Morning settings.",
    mode: "single",
    triggers: [{ trigger: "time", at: `${m.time}:00` }],
    conditions: m.days.length && m.days.length < 7 ? [{ condition: "time", weekday: m.days.map((d) => WEEKDAYS[d]) }] : [],
    actions: [{ parallel: branches }],
  };
  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`couldn't create the morning automation (${res.status})`);
}

/** Run the morning routine right now (for the Test button). */
export async function testMorning() {
  await call("automation", "trigger", { entity_id: "automation.home_base_morning_wake_up", skip_condition: true });
}

/** Speaker volume for everything that can play sound (not the TVs). */
export async function setSpeakersVolume(volume: number) {
  const res = await fetch(`${URL_()}/api/states`, { headers: headers(), cache: "no-store" });
  if (!res.ok) return;
  const raw = (await res.json()) as HaState[];
  const speakers = raw.filter((s) => s.entity_id.startsWith("media_player.") && s.attributes.volume_level != null && s.state !== "unavailable" && !/\b(tv|uhd|crystal)\b/i.test(s.attributes.friendly_name ?? "")).map((s) => s.entity_id);
  if (speakers.length) await call("media_player", "volume_set", { entity_id: speakers, volume_level: Math.max(0, Math.min(100, volume)) / 100 });
}

/** "It's the night": every light and switch off (no exemptions), speakers to the night volume, all in one go. */
export async function nightMode(volume: number, speakerIds: string[]) {
  const speakers = speakerIds.filter((id) => id.startsWith("media_player."));
  await Promise.all([
    call("light", "turn_off", { entity_id: "all" }),
    call("switch", "turn_off", { entity_id: "all" }),
    ...(speakers.length ? [call("media_player", "volume_set", { entity_id: speakers, volume_level: Math.max(0, Math.min(100, volume)) / 100 })] : []),
  ]);
}

/** Is the owner's phone close by? Their person entity must be home and, when the phone's Home Assistant app reports which
 *  Wi-Fi it is on (a sensor with "ssid" in its name), it must be connected to one (not just somewhere inside the home zone). */
export async function ownerNearby(): Promise<{ nearby: boolean; home: boolean; ssid: string }> {
  const template = "{% set ns = namespace(any=false, home=false, ssid='') %}"
    + "{% for p in states.person %}{% set ns.any = true %}{% if 'bridger' in p.name | lower and p.state == 'home' %}{% set ns.home = true %}{% endif %}{% endfor %}"
    + "{% if states.person | selectattr('name','search','(?i)bridger') | list | count == 0 %}{% set ns.home = states.person | selectattr('state','eq','home') | list | count > 0 %}{% endif %}"
    + "{% for s in states.sensor if 'ssid' in s.entity_id and ('iphone' in s.entity_id or 'bridger' in s.entity_id) %}{% set ns.ssid = s.state %}{% endfor %}"
    + "{{ ns.home }}|{{ ns.ssid }}";
  const res = await fetch(`${URL_()}/api/template`, { method: "POST", headers: headers(), body: JSON.stringify({ template }), cache: "no-store" });
  if (!res.ok) throw new Error(`Home Assistant responded ${res.status}`);
  const [home, ssid] = (await res.text()).trim().split("|");
  const isHome = home === "True";
  const wifiBad = ["not connected", "unknown", "unavailable", "none"].includes((ssid ?? "").trim().toLowerCase());
  return { nearby: isHome && !((ssid ?? "").trim() !== "" && wifiBad), home: isHome, ssid: (ssid ?? "").trim() };
}

/** Home Assistant's Google Assistant SDK integration (if set up) can say things to Google Assistant, the same way a voice
 *  command does: that is how "play X on Spotify on <speaker>" reaches Nest/Cast speakers Spotify can't list. */
export async function assistantAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${URL_()}/api/services`, { headers: headers(), cache: "no-store" });
    if (!res.ok) return false;
    const all = (await res.json()) as { domain: string; services: Record<string, unknown> }[];
    return Boolean(all.find((d) => d.domain === "google_assistant_sdk")?.services?.send_text_command);
  } catch {
    return false;
  }
}

export async function assistantCommand(command: string) {
  await call("google_assistant_sdk", "send_text_command", { command });
}

export interface LightInfo {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  platform: string;
  /** Home Assistant's supported_color_modes, e.g. ["color_temp","hs"] or ["onoff"] */
  modes: string[];
  colorMode: string | null;
  minKelvin: number | null;
  maxKelvin: number | null;
  /** can it fade between colours on its own (supported_features bit 32) */
  transition: boolean;
  effects: boolean;
  on: boolean;
  available: boolean;
}

/** Brand, model and colour abilities of every light, in one template call plus one states call. */
export async function lightsInfo(): Promise<LightInfo[]> {
  const template = "{% for s in states.light %}{{ s.entity_id }}|{{ device_attr(s.entity_id,'manufacturer') or '' }}|{{ device_attr(s.entity_id,'model') or '' }}|{{ (integration_entities('tuya') | list).count(s.entity_id) > 0 }}\n{% endfor %}";
  const [tplRes, stRes] = await Promise.all([
    fetch(`${URL_()}/api/template`, { method: "POST", headers: headers(), body: JSON.stringify({ template }), cache: "no-store" }),
    fetch(`${URL_()}/api/states`, { headers: headers(), cache: "no-store" }),
  ]);
  const meta = new Map<string, { manufacturer: string; model: string; tuya: boolean }>();
  if (tplRes.ok) for (const line of (await tplRes.text()).split("\n").filter(Boolean)) { const [id, man, mod, tuya] = line.split("|"); meta.set(id, { manufacturer: man, model: mod, tuya: tuya === "True" }); }
  const raw = (await stRes.json()) as (HaState & { attributes: Record<string, unknown> })[];
  return raw.filter((s) => s.entity_id.startsWith("light.")).map((s) => {
    const m = meta.get(s.entity_id);
    const a = s.attributes as Record<string, unknown>;
    const features = Number(a.supported_features ?? 0);
    return {
      id: s.entity_id,
      name: unescapeName(String(a.friendly_name ?? s.entity_id)),
      manufacturer: m?.manufacturer ?? "",
      model: m?.model ?? "",
      platform: m?.tuya ? "tuya" : "",
      modes: Array.isArray(a.supported_color_modes) ? (a.supported_color_modes as string[]) : [],
      colorMode: typeof a.color_mode === "string" ? a.color_mode : null,
      minKelvin: typeof a.min_color_temp_kelvin === "number" ? a.min_color_temp_kelvin : null,
      maxKelvin: typeof a.max_color_temp_kelvin === "number" ? a.max_color_temp_kelvin : null,
      transition: (features & 32) !== 0,
      effects: (features & 4) !== 0,
      on: s.state === "on",
      available: s.state !== "unavailable",
    };
  });
}

const fadeName = (id: string) => `hb_fade_${id.replace(/[^a-z0-9]/gi, "_").toLowerCase()}`;
const fadeVerified = new Set<string>();

/** One restartable Home Assistant script per light that plays a timed list of frames: wait `start_in` seconds, then for each frame
 *  turn the light on with its data (or off) and wait `wait` seconds. Starting it again restarts it, so a new plan always cancels
 *  the old one: nothing can fight it, and all the timing runs inside Home Assistant, not on the hosting plan. */
export async function installFadeScripts(): Promise<string[]> {
  const raw = (await (await fetch(`${URL_()}/api/states`, { headers: headers(), cache: "no-store" })).json()) as HaState[];
  const lights = raw.filter((s) => s.entity_id.startsWith("light.")).map((s) => s.entity_id);
  for (const id of lights) {
    const body = {
      alias: `Home Base fade: ${id}`,
      mode: "restart",
      sequence: [
        { delay: "{{ start_in | default(0) | float(0) }}" },
        { repeat: { for_each: "{{ frames }}", sequence: [
          { if: [{ condition: "template", value_template: "{{ repeat.item.off | default(false) }}" }],
            then: [{ action: "light.turn_off", target: { entity_id: id } }],
            else: [{ action: "light.turn_on", target: { entity_id: id }, data: "{{ repeat.item.data | default({}) }}" }] },
          { delay: "{{ repeat.item.wait | default(0) | float(0) }}" },
        ] } },
      ],
    };
    const res = await fetch(`${URL_()}/api/config/script/config/${fadeName(id)}`, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store" });
    if (!res.ok) throw new Error(`couldn't create the fade script for ${id} (${res.status})`);
    fadeVerified.add(id);
  }
  return lights;
}

/** Make sure the fade scripts for these lights exist (checks once per light, then remembers). */
async function ensureFade(ids: string[]) {
  const unknown = ids.filter((id) => !fadeVerified.has(id));
  if (unknown.length === 0) return;
  const exists = await Promise.all(unknown.map(async (id) => (await fetch(`${URL_()}/api/states/script.${fadeName(id)}`, { headers: headers(), cache: "no-store" })).ok));
  if (exists.some((ok) => !ok)) await installFadeScripts();
  else unknown.forEach((id) => fadeVerified.add(id));
}

/** One step of a light plan: what to send (light.turn_on data, or off), then how long to wait before the next step (seconds). */
export interface FadeFrame { data?: Record<string, unknown>; off?: boolean; wait: number }

/** Play a timed plan on a light from Home Assistant's side, replacing any plan already running on it. */
export async function runFade(id: string, frames: FadeFrame[], startInSeconds: number) {
  await ensureFade([id]);
  await call("script", "turn_on", { entity_id: `script.${fadeName(id)}`, variables: { frames, start_in: startInSeconds } });
}

/** Cancel any fade running on a light (before an instant on/off). */
export async function stopFade(id: string) {
  try { await call("script", "turn_off", { entity_id: `script.${fadeName(id)}` }); } catch { /* no fade was running */ }
}


export interface SpeakerInfo {
  id: string;
  name: string;
  state: string;
  title: string;
  artist: string;
  album: string;
  /** length of what is playing in ms, 0 when the speaker doesn't know (live radio, streams) */
  durationMs: number;
  /** position in the song (ms) as of `at` (server ms), when the speaker reports one */
  positionMs: number | null;
  at: number | null;
  /** the app playing on it: "Spotify", "YouTube Music", "Google Podcasts"... */
  app: string;
  /** the speaker has cover art for what it is playing */
  hasPicture: boolean;
  volume: number | null;
}

/** Every speaker's state in one call. Cast speakers report what they play within a second of a change, whatever the app is:
 *  the music brain cross-checks Spotify against this, and uses it as the source when the music isn't coming from Spotify. */
export async function speakerStates(): Promise<SpeakerInfo[]> {
  const T = "¦";
  const a = (k: string) => `{{ s.attributes.${k} if s.attributes.${k} is not none else '' }}`;
  const template = `{% for s in states.media_player %}{{ s.entity_id }}${T}{{ s.attributes.friendly_name or '' }}${T}{{ s.state }}${T}${a("media_title")}${T}${a("media_artist")}${T}${a("media_album_name")}${T}${a("media_duration")}${T}${a("media_position")}${T}{{ as_timestamp(s.attributes.media_position_updated_at) if s.attributes.media_position_updated_at else '' }}${T}{{ s.attributes.app_name or '' }}${T}{{ '1' if s.attributes.entity_picture else '' }}${T}${a("volume_level")}\n{% endfor %}`;
  const res = await fetch(`${URL_()}/api/template`, { method: "POST", headers: headers(), body: JSON.stringify({ template }), cache: "no-store" });
  if (!res.ok) throw new Error(`Home Assistant template failed (${res.status})`);
  const n = (v: string | undefined) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return (await res.text()).split("\n").filter(Boolean).map((line) => {
    const [id, name, state, title, artist, album, dur, pos, at, app, pic, vol] = line.split(T);
    return {
      id, name, state, title, artist, album,
      durationMs: Math.round((n(dur) ?? 0) * 1000),
      positionMs: n(pos) == null ? null : Math.round(n(pos)! * 1000),
      at: n(at) == null ? null : Math.round(n(at)! * 1000),
      app: app ?? "", hasPicture: pic === "1", volume: n(vol) == null ? null : Math.round(n(vol)! * 100),
    };
  });
}

/** The cover art a speaker is showing (Home Assistant serves it behind its own login, so the dashboard fetches it for the screens). */
export async function speakerPicture(entityId: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  if (!entityId.startsWith("media_player.")) return null;
  const st = await fetch(`${URL_()}/api/states/${entityId}`, { headers: headers(), cache: "no-store" });
  if (!st.ok) return null;
  const path = ((await st.json()) as HaState).attributes.entity_picture as string | undefined;
  if (!path) return null;
  const img = await fetch(path.startsWith("http") ? path : `${URL_()}${path}`, { headers: headers(), cache: "no-store" });
  if (!img.ok) return null;
  return { body: await img.arrayBuffer(), type: img.headers.get("content-type") ?? "image/jpeg" };
}

/** The Home Assistant automation that nudges the music brain: every 5 seconds while something plays (once a minute otherwise),
 *  and at once when a speaker starts, stops or changes song. The brain, not the screens, is what talks to Spotify. */
export async function installMusicTick(speakerIds: string[]) {
  const body = {
    alias: "Home Base: music tick",
    description: "Calls the Home Base music brain so every screen and the lights stay in step with the music. Installed from the tablet.",
    mode: "queued",
    max: 4,
    max_exceeded: "silent",
    triggers: [
      { trigger: "time_pattern", seconds: "/5", id: "tick" },
      ...(speakerIds.length ? [
        { trigger: "state", entity_id: speakerIds, attribute: "media_title", id: "change" },
        { trigger: "state", entity_id: speakerIds, to: null, id: "change" },
      ] : []),
    ],
    conditions: [{ condition: "template", value_template: "{{ trigger.id == 'change' or now().second < 5 or (states.media_player | selectattr('state','eq','playing') | list | count > 0) }}" }],
    actions: [{ action: "rest_command.home_base_hook", data: { do: "tick" }, continue_on_error: true }],
  };
  const res = await fetch(`${URL_()}/api/config/automation/config/home_base_music_tick`, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`couldn't create the music tick automation (${res.status})`);
  await call("automation", "reload", {});
}


/** Everything the Home Assistant app reports about the tablet, as { entity suffix: state } (e.g. battery_level, battery_state,
 *  interactive, battery_temperature, wifi_signal_strength...), in one template call. */
export async function tabletDeviceStates(device: string): Promise<Record<string, string>> {
  const T = "¦";
  const template = `{% set d = device_id('sensor.${device}_battery_level') %}{% if d %}{% for e in device_entities(d) %}{{ e }}${T}{{ states(e) }}\n{% endfor %}{% endif %}`;
  const res = await fetch(`${URL_()}/api/template`, { method: "POST", headers: headers(), body: JSON.stringify({ template }), cache: "no-store" });
  if (!res.ok) throw new Error(`Home Assistant template failed (${res.status})`);
  const out: Record<string, string> = {};
  for (const line of (await res.text()).split("\n").filter(Boolean)) {
    const [id, state] = line.split(T);
    const key = id.replace(/^[a-z_]+\./, "").replace(`${device}_`, "");
    if (state && state !== "unknown" && state !== "unavailable") out[key] = state.slice(0, 40);
  }
  return out;
}

/** Home Assistant calls the dashboard every few minutes so the tablet's battery is logged together with what was going on. */
export async function installBatteryLog() {
  const body = {
    alias: "Home Base: log the tablet battery",
    description: "Every 3 minutes the dashboard records the tablet's battery with what was going on (screen, motion, music), to find what drains it.",
    mode: "single",
    triggers: [{ trigger: "time_pattern", minutes: "/3" }],
    actions: [{ action: "rest_command.home_base_hook", data: { do: "battery" }, continue_on_error: true }],
  };
  const res = await fetch(`${URL_()}/api/config/automation/config/home_base_battery_log`, { method: "POST", headers: headers(), body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`couldn't create the battery log automation (${res.status})`);
  await call("automation", "reload", {});
}


/** How much of the last `windowMs` the tablet's screen was most likely on, 0 to 1. The Home Assistant app doesn't report the screen
 *  state, but the screen is driven by the motion sensor (on at movement, off about 20 seconds after the last one), so the sensor's
 *  history says when it was lit. Touches that wake the screen aren't counted. */
export async function screenOnFraction(windowMs: number, entity = "binary_sensor.tablet_camera_motion"): Promise<number | null> {
  const now = Date.now(), start = now - windowMs, TAIL = 17_000;
  const res = await fetch(`${URL_()}/api/history/period/${new Date(start).toISOString()}?filter_entity_id=${entity}&minimal_response&no_attributes`, { headers: headers(), cache: "no-store" });
  if (!res.ok) return null;
  const rows = ((await res.json()) as { state: string; last_changed?: string; last_updated?: string }[][])[0] ?? [];
  if (!rows.length) return null;
  const spans: [number, number][] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].state !== "on") continue;
    const from = Math.max(start, new Date(rows[i].last_changed ?? rows[i].last_updated ?? start).getTime());
    const to = Math.min(now, (i + 1 < rows.length ? new Date(rows[i + 1].last_changed ?? rows[i + 1].last_updated ?? now).getTime() : now) + TAIL);
    if (to > from) spans.push([from, to]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0, curEnd = start;
  for (const [a, b] of spans) { const from = Math.max(a, curEnd); if (b > from) { total += b - from; curEnd = b; } }
  return Math.min(1, total / windowMs);
}
