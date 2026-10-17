import { d1Query } from "@/lib/d1";
import { DEFAULT_MORNING, EMPTY_HOME_CONFIG, type HomeConfig, type MorningConfig, type HomeEntity, type SavedScene } from "./types";

const KEY = "homeConfig";

const strMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === "string" && val.trim()) out[k.slice(0, 120)] = val.trim().slice(0, 60);
  return out;
};

export function parseMorning(v: unknown): MorningConfig {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_MORNING;
  const time = typeof o.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.time) ? o.time : d.time;
  const days = Array.isArray(o.days) ? [...new Set((o.days as unknown[]).filter((x): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6))] : d.days;
  const num = (x: unknown, lo: number, hi: number, dflt: number) => (typeof x === "number" && Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : dflt);
  return {
    enabled: o.enabled === true,
    time,
    days,
    minutes: num(o.minutes, 5, 60, d.minutes),
    lightIds: Array.isArray(o.lightIds) ? (o.lightIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 60) : [],
    music: o.music !== false,
    volume: num(o.volume, 0, 100, d.volume),
    fanSpeed: o.fanSpeed === null || o.fanSpeed === undefined ? null : num(o.fanSpeed, 0, 100, 50),
    tablet: o.tablet !== false,
  };
}

function parseTimers(v: unknown): HomeConfig["timers"] {
  const out: HomeConfig["timers"] = {};
  if (v && typeof v === "object") {
    for (const [id, t] of Object.entries(v as Record<string, unknown>)) {
      const o = t as { endsAt?: unknown; action?: unknown };
      if (typeof o?.endsAt === "number" && o.endsAt > Date.now() && (o.action === "on" || o.action === "off")) out[id.slice(0, 120)] = { endsAt: o.endsAt, action: o.action };
    }
  }
  return out;
}

export function parseHomeConfig(raw: unknown): HomeConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const scenes: SavedScene[] = Array.isArray(r.scenes)
    ? (r.scenes as Record<string, unknown>[])
        .filter((s) => s && typeof s.id === "string" && typeof s.name === "string" && s.lights && typeof s.lights === "object")
        .slice(0, 40)
        .map((s) => ({ id: String(s.id).slice(0, 60), name: String(s.name).slice(0, 40), lights: s.lights as SavedScene["lights"] }))
    : [];
  return {
    hidden: Array.isArray(r.hidden) ? (r.hidden as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 300) : [],
    rooms: strMap(r.rooms),
    names: strMap(r.names),
    scenes,
    timers: parseTimers(r.timers),
    morning: parseMorning(r.morning),
    keepOn: Array.isArray(r.keepOn) ? (r.keepOn as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 300) : [],
  };
}

export async function getHomeConfig(): Promise<HomeConfig> {
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [KEY]);
    return rows[0]?.value ? parseHomeConfig(JSON.parse(rows[0].value)) : { ...EMPTY_HOME_CONFIG };
  } catch {
    return { ...EMPTY_HOME_CONFIG };
  }
}

export async function saveHomeConfig(config: HomeConfig) {
  await d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [KEY, JSON.stringify(config)]);
}

/** Apply names / rooms / hidden, and add the dashboard's own saved scenes as scene buttons. */
export function applyHomeConfig(entities: HomeEntity[], config: HomeConfig): HomeEntity[] {
  const hidden = new Set(config.hidden);
  const out = entities
    .filter((e) => !hidden.has(e.id))
    .map((e) => ({ ...e, name: config.names[e.id] ?? e.name, room: config.rooms[e.id] ?? e.room }));
  for (const s of config.scenes) out.push({ id: `custom:${s.id}`, name: s.name, kind: "scene", room: "Scenes", available: true, custom: true });
  // speakers/TVs that are playing come first
  return out.sort((a, b) => Number(Boolean(b.playing)) - Number(Boolean(a.playing)));
}
