import { d1Query } from "@/lib/d1";

export interface Settings {
  favoriteTeam: string | null;
  commuteOriginLabel: string | null;
  commuteOriginLat: number | null;
  commuteOriginLon: number | null;
  commuteDestLabel: string | null;
  commuteDestLat: number | null;
  commuteDestLon: number | null;
}

const KEYS = [
  "favoriteTeam",
  "commuteOriginLabel",
  "commuteOriginLat",
  "commuteOriginLon",
  "commuteDestLabel",
  "commuteDestLat",
  "commuteDestLon",
] as const;

const NUMERIC_KEYS = new Set(["commuteOriginLat", "commuteOriginLon", "commuteDestLat", "commuteDestLon"]);

export async function getSettings(): Promise<Settings> {
  const rows = await d1Query<{ key: string; value: string | null }>(
    `SELECT key, value FROM settings WHERE key IN (${KEYS.map(() => "?").join(",")})`,
    [...KEYS]
  );
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const result: Record<string, string | number | null> = {};
  for (const key of KEYS) {
    const raw = byKey[key] ?? null;
    result[key] = raw !== null && NUMERIC_KEYS.has(key) ? Number(raw) : raw;
  }
  return result as unknown as Settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  for (const key of KEYS) {
    if (key in patch) {
      const value = patch[key];
      await d1Query(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value === null || value === undefined ? null : String(value)]
      );
    }
  }
  return getSettings();
}
