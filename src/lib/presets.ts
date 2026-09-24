import { put, head } from "@vercel/blob";

export const WIDGET_TYPES = ["clock", "weather", "worldclocks", "news"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export interface Preset {
  id: string;
  name: string;
  widgets: WidgetType[];
  createdAt: number;
  updatedAt: number;
}

const PRESETS_PATH = "home-base/presets.json";

async function readPresets(): Promise<Record<string, Preset>> {
  try {
    const info = await head(PRESETS_PATH);
    const res = await fetch(`${info.url}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!res.ok) return {};
    return (await res.json()) as Record<string, Preset>;
  } catch {
    return {};
  }
}

async function writePresets(presets: Record<string, Preset>): Promise<void> {
  await put(PRESETS_PATH, JSON.stringify(presets), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

export async function listPresets(): Promise<Preset[]> {
  const presets = await readPresets();
  return Object.values(presets).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPreset(id: string): Promise<Preset | null> {
  const presets = await readPresets();
  return presets[id] ?? null;
}

export async function createPreset(name: string, widgets: WidgetType[]): Promise<Preset> {
  const presets = await readPresets();
  const now = Date.now();
  const preset: Preset = {
    id: crypto.randomUUID(),
    name,
    widgets,
    createdAt: now,
    updatedAt: now,
  };
  presets[preset.id] = preset;
  await writePresets(presets);
  return preset;
}

export async function updatePreset(
  id: string,
  patch: Partial<Pick<Preset, "name" | "widgets">>
): Promise<Preset | null> {
  const presets = await readPresets();
  const existing = presets[id];
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: Date.now() };
  presets[id] = updated;
  await writePresets(presets);
  return updated;
}

export async function deletePreset(id: string): Promise<boolean> {
  const presets = await readPresets();
  if (!presets[id]) return false;
  delete presets[id];
  await writePresets(presets);
  return true;
}
