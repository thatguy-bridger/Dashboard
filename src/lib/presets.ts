import { d1Query } from "@/lib/d1";

export const WIDGET_TYPES = [
  "clock",
  "weather",
  "worldclocks",
  "news",
  "sports",
  "calendar",
  "locations",
  "gmail",
  "drive",
  "photos",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_SIZES = ["sm", "md", "lg", "xl"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

// Grid units each size spans, out of a 4-column x 3-row screen grid.
export const SIZE_SPANS: Record<WidgetSize, { col: number; row: number }> = {
  sm: { col: 1, row: 1 },
  md: { col: 2, row: 1 },
  lg: { col: 2, row: 2 },
  xl: { col: 4, row: 2 },
};

export interface PresetWidget {
  type: WidgetType;
  size: WidgetSize;
}

export interface Preset {
  id: string;
  name: string;
  widgets: PresetWidget[];
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

function isWidgetType(v: unknown): v is WidgetType {
  return typeof v === "string" && (WIDGET_TYPES as readonly string[]).includes(v);
}

function isWidgetSize(v: unknown): v is WidgetSize {
  return typeof v === "string" && (WIDGET_SIZES as readonly string[]).includes(v);
}

/** Accepts both the new {type,size}[] shape and the old string[] shape (pre-resize presets). */
export function parseWidgets(raw: unknown): PresetWidget[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): PresetWidget | null => {
      if (isWidgetType(item)) return { type: item, size: "md" };
      if (item && typeof item === "object" && isWidgetType((item as { type?: unknown }).type)) {
        const size = isWidgetSize((item as { size?: unknown }).size) ? (item as { size: WidgetSize }).size : "md";
        return { type: (item as { type: WidgetType }).type, size };
      }
      return null;
    })
    .filter((w): w is PresetWidget => w !== null);
}

function fromRow(row: PresetRow): Preset {
  return {
    id: row.id,
    name: row.name,
    widgets: parseWidgets(JSON.parse(row.widgets)),
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

export async function createPreset(name: string, widgets: PresetWidget[]): Promise<Preset> {
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
