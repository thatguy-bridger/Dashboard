import { d1Query } from "@/lib/d1";

export interface Settings {
  favoriteTeam: string | null;
}

export async function getSettings(): Promise<Settings> {
  const rows = await d1Query<{ key: string; value: string | null }>(
    "SELECT key, value FROM settings WHERE key = 'favoriteTeam'"
  );
  return { favoriteTeam: rows[0]?.value ?? null };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  if ("favoriteTeam" in patch) {
    await d1Query(
      `INSERT INTO settings (key, value) VALUES ('favoriteTeam', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [patch.favoriteTeam]
    );
  }
  return getSettings();
}
