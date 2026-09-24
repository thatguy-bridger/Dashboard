import { put, head } from "@vercel/blob";

export interface Settings {
  favoriteTeam: string | null;
}

const SETTINGS_PATH = "home-base/settings.json";
const DEFAULTS: Settings = { favoriteTeam: null };

export async function getSettings(): Promise<Settings> {
  try {
    const info = await head(SETTINGS_PATH);
    const res = await fetch(`${info.url}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return DEFAULTS;
    return { ...DEFAULTS, ...(await res.json()) };
  } catch {
    return DEFAULTS;
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...patch };
  await put(SETTINGS_PATH, JSON.stringify(updated), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
  return updated;
}
