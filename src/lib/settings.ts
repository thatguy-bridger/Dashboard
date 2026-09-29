import { d1Query } from "@/lib/d1";

export interface MapPlace {
  label: string;
  lat: number;
  lon: number;
}

export interface Settings {
  favoriteTeam: string | null;
  mapHome: MapPlace | null;
  mapDestination: MapPlace | null;
}

const KEYS = ["favoriteTeam", "mapHome", "mapDestination"] as const;
type Key = (typeof KEYS)[number];

function parsePlace(raw: string | null): MapPlace | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj?.label === "string" && typeof obj?.lat === "number" && typeof obj?.lon === "number") {
      return obj as MapPlace;
    }
  } catch {
    // fall through
  }
  return null;
}

export async function getSettings(): Promise<Settings> {
  const rows = await d1Query<{ key: string; value: string | null }>(
    `SELECT key, value FROM settings WHERE key IN (${KEYS.map(() => "?").join(",")})`,
    [...KEYS]
  );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    favoriteTeam: byKey.get("favoriteTeam") ?? null,
    mapHome: parsePlace(byKey.get("mapHome") ?? null),
    mapDestination: parsePlace(byKey.get("mapDestination") ?? null),
  };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  async function set(key: Key, value: string | null) {
    await d1Query(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  }

  if ("favoriteTeam" in patch) await set("favoriteTeam", patch.favoriteTeam ?? null);
  if ("mapHome" in patch) await set("mapHome", patch.mapHome ? JSON.stringify(patch.mapHome) : null);
  if ("mapDestination" in patch) await set("mapDestination", patch.mapDestination ? JSON.stringify(patch.mapDestination) : null);

  return getSettings();
}
