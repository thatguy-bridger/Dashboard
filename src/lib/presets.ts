import { d1Query } from "@/lib/d1";

export const WIDGET_TYPES = ["clock", "weather", "worldclocks", "news", "sports"] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export interface Preset {
  id: string;
  name: string;
  widgets: WidgetType[];
  createdAt: number;
  updatedAt: number;
}

interface PresetRow {
  id: string;
  name: string;
  widgets: string;
  created_at: number;
  updated_at: number;
}

function fromRow(row: PresetRow): Preset {
  return {
    id: row.id,
    name: row.name,
    widgets: JSON.parse(row.widgets),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPresets(): Promise<Preset[]> {
  const rows = await d1Query<PresetRow>("SELECT * FROM presets ORDER BY updated_at DESC");
  return rows.map(fromRow);
}

export async function getPreset(id: string): Promise<Preset | null> {
  const rows = await d1Query<PresetRow>("SELECT * FROM presets WHERE id = ?", [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function createPreset(name: string, widgets: WidgetType[]): Promise<Preset> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await d1Query(
    "INSERT INTO presets (id, name, widgets, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [id, name, JSON.stringify(widgets), now, now]
  );
  return { id, name, widgets, createdAt: now, updatedAt: now };
}

export async function updatePreset(
  id: string,
  patch: Partial<Pick<Preset, "name" | "widgets">>
): Promise<Preset | null> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if ("name" in patch) {
    sets.push("name = ?");
    values.push(patch.name);
  }
  if ("widgets" in patch) {
    sets.push("widgets = ?");
    values.push(JSON.stringify(patch.widgets));
  }
  sets.push("updated_at = ?");
  values.push(Date.now());

  values.push(id);
  await d1Query(`UPDATE presets SET ${sets.join(", ")} WHERE id = ?`, values);
  return getPreset(id);
}

export async function deletePreset(id: string): Promise<boolean> {
  const existing = await getPreset(id);
  if (!existing) return false;
  await d1Query("DELETE FROM presets WHERE id = ?", [id]);
  return true;
}
