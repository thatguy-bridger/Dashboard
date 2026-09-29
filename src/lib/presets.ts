import { d1Query } from "@/lib/d1";
import { autoLayout, clampWidget, type GridWidget } from "@/lib/grid";
import { parseBackground, DEFAULT_BACKGROUND, type BackgroundConfig } from "@/lib/background";

export const WIDGET_TYPES = [
  "clock",
  "weather",
  "worldclocks",
  "news",
  "sports",
  "calendar",
  "traffic",
  "locations",
  "gmail",
  "drive",
  "photos",
  "trafficcamera",
  "countdown",
  "airquality",
  "history",
  "stocks",
  "radar",
  "notifications",
  "lyrics",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_LABELS: Record<WidgetType, string> = {
  clock: "Clock",
  weather: "Weather",
  worldclocks: "World clocks",
  news: "News",
  sports: "Sports",
  calendar: "Calendar",
  traffic: "Traffic",
  locations: "Locations",
  gmail: "Gmail",
  drive: "Drive files",
  photos: "Photos",
  trafficcamera: "Traffic camera",
  countdown: "Countdown",
  airquality: "Air quality",
  history: "On this day",
  stocks: "Stocks",
  radar: "Weather radar",
  notifications: "Notifications",
  lyrics: "Lyrics",
};

/** Grid footprint a widget starts at when dropped in from the palette —
 *  most default to a generic 4x3, but some read better narrower/taller. */
export const PREFERRED_SIZE: Partial<Record<WidgetType, { w: number; h: number }>> = {
  lyrics: { w: 2, h: 5 },
};

// Kept for widget-internal content-density decisions (derived from grid footprint) and
// for parsing very old presets — layout itself is now x/y/w/h on the grid.
export const WIDGET_SIZES = ["sm", "md", "lg", "xl"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const SIZE_SPANS: Record<WidgetSize, { col: number; row: number }> = {
  sm: { col: 1, row: 1 },
  md: { col: 2, row: 1 },
  lg: { col: 2, row: 2 },
  xl: { col: 4, row: 2 },
};

export type PresetWidget = GridWidget;

export interface Preset {
  id: string;
  name: string;
  widgets: PresetWidget[];
  background: BackgroundConfig;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

interface PresetRow {
  id: string;
  name: string;
  widgets: string;
  is_default: number | null;
  created_at: number;
  updated_at: number;
}

function isWidgetType(v: unknown): v is WidgetType {
  return typeof v === "string" && (WIDGET_TYPES as readonly string[]).includes(v);
}

function isWidgetSize(v: unknown): v is WidgetSize {
  return typeof v === "string" && (WIDGET_SIZES as readonly string[]).includes(v);
}

function isGridShape(item: unknown): item is PresetWidget {
  return (
    !!item &&
    typeof item === "object" &&
    isWidgetType((item as { type?: unknown }).type) &&
    typeof (item as { x?: unknown }).x === "number" &&
    typeof (item as { y?: unknown }).y === "number" &&
    typeof (item as { w?: unknown }).w === "number" &&
    typeof (item as { h?: unknown }).h === "number"
  );
}

/** Accepts the current {type,x,y,w,h}[] shape and both older shapes (pre-grid presets). */
export function parseWidgets(raw: unknown): PresetWidget[] {
  if (!Array.isArray(raw)) return [];

  if (raw.length > 0 && isGridShape(raw[0])) {
    return raw
      .filter(isGridShape)
      .map((w, i) =>
        clampWidget({
          id: typeof (w as { id?: unknown }).id === "string" ? (w as { id: string }).id : `${w.type}-${i}`,
          type: w.type,
          x: w.x,
          y: w.y,
          w: w.w,
          h: w.h,
          temporary: (w as { temporary?: unknown }).temporary === true,
        })
      );
  }

  // Legacy: string[] or {type,size}[] with no position — auto-pack onto the grid.
  const legacy = raw
    .map((item): { type: WidgetType; size: WidgetSize } | null => {
      if (isWidgetType(item)) return { type: item, size: "md" };
      if (item && typeof item === "object" && isWidgetType((item as { type?: unknown }).type)) {
        const size = isWidgetSize((item as { size?: unknown }).size) ? (item as { size: WidgetSize }).size : "md";
        return { type: (item as { type: WidgetType }).type, size };
      }
      return null;
    })
    .filter((w): w is { type: WidgetType; size: WidgetSize } => w !== null);

  return autoLayout(legacy);
}

/** Preset rows store `{ widgets, background }` as JSON in the `widgets` column (no schema change needed). */
function parsePresetData(raw: unknown): { widgets: PresetWidget[]; background: BackgroundConfig } {
  if (Array.isArray(raw)) {
    // Oldest shape: the column held the widgets array directly.
    return { widgets: parseWidgets(raw), background: DEFAULT_BACKGROUND };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as { widgets?: unknown; background?: unknown };
    return { widgets: parseWidgets(obj.widgets), background: parseBackground(obj.background) };
  }
  return { widgets: [], background: DEFAULT_BACKGROUND };
}

function serializePresetData(widgets: PresetWidget[], background: BackgroundConfig): string {
  return JSON.stringify({ widgets, background });
}

function fromRow(row: PresetRow): Preset {
  const { widgets, background } = parsePresetData(JSON.parse(row.widgets));
  return {
    id: row.id,
    name: row.name,
    widgets,
    background,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The `presets` table predates the default-preset flag — add the column lazily
 *  instead of requiring an out-of-band migration. Safe to call repeatedly. */
let defaultColumnReady: Promise<void> | null = null;
function ensureDefaultColumn(): Promise<void> {
  if (!defaultColumnReady) {
    defaultColumnReady = d1Query("ALTER TABLE presets ADD COLUMN is_default INTEGER").then(
      () => undefined,
      () => undefined // already exists
    );
  }
  return defaultColumnReady;
}

export async function listPresets(): Promise<Preset[]> {
  await ensureDefaultColumn();
  const rows = await d1Query<PresetRow>("SELECT * FROM presets ORDER BY updated_at DESC");
  return rows.map(fromRow);
}

export async function getPreset(id: string): Promise<Preset | null> {
  await ensureDefaultColumn();
  const rows = await d1Query<PresetRow>("SELECT * FROM presets WHERE id = ?", [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function getDefaultPreset(): Promise<Preset | null> {
  await ensureDefaultColumn();
  const rows = await d1Query<PresetRow>("SELECT * FROM presets WHERE is_default = 1 LIMIT 1");
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function createPreset(
  name: string,
  widgets: PresetWidget[],
  background: BackgroundConfig = DEFAULT_BACKGROUND
): Promise<Preset> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await d1Query(
    "INSERT INTO presets (id, name, widgets, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [id, name, serializePresetData(widgets, background), now, now]
  );
  return { id, name, widgets, background, isDefault: false, createdAt: now, updatedAt: now };
}

/** Marks one preset as the default new devices land on. Only one preset can
 * be default at a time, so this clears the flag off every other preset. */
export async function setDefaultPreset(id: string): Promise<Preset | null> {
  await ensureDefaultColumn();
  const existing = await getPreset(id);
  if (!existing) return null;
  await d1Query("UPDATE presets SET is_default = 0");
  await d1Query("UPDATE presets SET is_default = 1 WHERE id = ?", [id]);
  return getPreset(id);
}

export async function updatePreset(
  id: string,
  patch: Partial<Pick<Preset, "name" | "widgets" | "background">>
): Promise<Preset | null> {
  const existing = await getPreset(id);
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  if ("name" in patch && typeof patch.name === "string") {
    sets.push("name = ?");
    values.push(patch.name);
  }
  if ("widgets" in patch || "background" in patch) {
    const widgets = patch.widgets ?? existing.widgets;
    const background = patch.background ?? existing.background;
    sets.push("widgets = ?");
    values.push(serializePresetData(widgets, background));
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
