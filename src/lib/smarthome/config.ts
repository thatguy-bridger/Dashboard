import { d1Query } from "@/lib/d1";
import { EMPTY_HOME_CONFIG, type HomeConfig, type HomeEntity, type SavedScene } from "./types";

const KEY = "homeConfig";

const strMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === "string" && val.trim()) out[k.slice(0, 120)] = val.trim().slice(0, 60);
  return out;
};

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
