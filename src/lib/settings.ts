import { d1Query } from "@/lib/d1";
import { mergeStandByLayout, type StandByItem } from "@/lib/standby";

export type DisplayMode = "color" | "image";
/** "standby" is the prebuilt full-screen view; "grid" is the customisable tile layout. */
export type LayoutMode = "standby" | "grid";

export interface MapPlace {
  label: string;
  lat: number;
  lon: number;
}

export interface FavoriteTeam {
  id: string;
  name: string;
  badge: string | null;
  sport: string | null;
  league: string | null;
}

export interface Settings {
  /** @deprecated superseded by favoriteTeams; kept only so old rows still parse. */
  favoriteTeam: string | null;
  favoriteTeams: FavoriteTeam[];
  mapHome: MapPlace | null;
  mapDestination: MapPlace | null;
  displayMode: DisplayMode;
  layoutMode: LayoutMode;
  standbyLayout: StandByItem[];
}

const KEYS = ["favoriteTeam", "favoriteTeams", "mapHome", "mapDestination", "displayMode", "layoutMode", "standbyLayout"] as const;
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

function parseJson(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function parseTeams(raw: string | null): FavoriteTeam[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (t): t is FavoriteTeam => t && typeof t === "object" && typeof t.id === "string" && typeof t.name === "string"
    );
  } catch {
    return [];
  }
}

export async function getSettings(): Promise<Settings> {
  const rows = await d1Query<{ key: string; value: string | null }>(
    `SELECT key, value FROM settings WHERE key IN (${KEYS.map(() => "?").join(",")})`,
    [...KEYS]
  );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const displayMode = byKey.get("displayMode");
  return {
    favoriteTeam: byKey.get("favoriteTeam") ?? null,
    favoriteTeams: parseTeams(byKey.get("favoriteTeams") ?? null),
    mapHome: parsePlace(byKey.get("mapHome") ?? null),
    mapDestination: parsePlace(byKey.get("mapDestination") ?? null),
    displayMode: displayMode === "image" ? "image" : "color",
    layoutMode: byKey.get("layoutMode") === "grid" ? "grid" : "standby",
    standbyLayout: mergeStandByLayout(parseJson(byKey.get("standbyLayout") ?? null)),
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
  if ("favoriteTeams" in patch) await set("favoriteTeams", patch.favoriteTeams ? JSON.stringify(patch.favoriteTeams) : null);
  if ("mapHome" in patch) await set("mapHome", patch.mapHome ? JSON.stringify(patch.mapHome) : null);
  if ("mapDestination" in patch) await set("mapDestination", patch.mapDestination ? JSON.stringify(patch.mapDestination) : null);
  if ("displayMode" in patch) await set("displayMode", patch.displayMode ?? null);
  if ("standbyLayout" in patch) await set("standbyLayout", patch.standbyLayout ? JSON.stringify(patch.standbyLayout) : null);
  if ("layoutMode" in patch) await set("layoutMode", patch.layoutMode ?? null);

  return getSettings();
}
