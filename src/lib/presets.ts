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
  "traffic",
  "countdown",
  "airquality",
  "history",
  "stocks",
  "radar",
  "commute",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_LABELS: Record<WidgetType, string> = {
  clock: "Clock",
  weather: "Weather",
  worldclocks: "World clocks",
  news: "News",
  sports: "Sports",
  calendar: "Calendar",
  locations: "Locations",
  gmail: "Gmail",
  drive: "Drive files",
  photos: "Photos",
  traffic: "Traffic camera",
  countdown: "Countdown",
  airquality: "Air quality",
  history: "On this day",
  stocks: "Stocks",
  radar: "Weather radar",
  commute: "Commute",
};

export const WIDGET_SIZES = ["sm", "md", "lg", "xl"] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

// Grid units each size spans, out of a 4-column x 3-row screen grid.
export const SIZE_SPANS: Record<WidgetSize, { col: number; row: number }> = {
  sm: { col: 1, row: 1 },
  md: { col: 2, row: 1 },
  lg: { col: 2, row: 2 },
  xl: { col: 4, row: 2 },
};

// Simple weather-condition groups a rule can match against — mirrors the
// same grouping weatherVisuals.ts uses for icons/gradients, not raw WMO codes.
export const VISIBILITY_WEATHER_CONDITIONS = ["clear", "cloudy", "rain", "snow", "storm"] as const;
export type VisibilityWeatherCondition = (typeof VISIBILITY_WEATHER_CONDITIONS)[number];

/** Every condition set on a widget must pass for it to show — this is
 * deliberately AND-only (no OR groups) since that covers "show this during
 * the morning window AND only if it's snowing" style rules without needing
 * a rule-builder UI. Omitted fields mean "don't constrain on this." */
export interface WidgetVisibility {
  /** 24h "HH:MM" strings. A range crossing midnight (e.g. 22:00-06:00) is
   * supported by treating end < start as wrapping past midnight. */
  timeStart?: string;
  timeEnd?: string;
  weather?: VisibilityWeatherCondition;
  /** Case-insensitive substring match against today's calendar event titles
   * (from /api/calendar) — e.g. "ski" only shows the widget on days with a
   * matching event. */
  calendarKeyword?: string;
}

export interface PresetWidget {
  type: WidgetType;
  size: WidgetSize;
  visibility?: WidgetVisibility;
}

export interface Preset {
  id: string;
  name: string;
  widgets: PresetWidget[];
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

interface PresetRow {
  id: string;
  name: string;
  widgets: string;
  is_default: number;
  created_at: number;
  updated_at: number;
}

function isWidgetType(v: unknown): v is WidgetType {
  return typeof v === "string" && (WIDGET_TYPES as readonly string[]).includes(v);
}

function isWidgetSize(v: unknown): v is WidgetSize {
  return typeof v === "string" && (WIDGET_SIZES as readonly string[]).includes(v);
}

function parseVisibility(raw: unknown): WidgetVisibility | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const result: WidgetVisibility = {};
  if (typeof v.timeStart === "string") result.timeStart = v.timeStart;
  if (typeof v.timeEnd === "string") result.timeEnd = v.timeEnd;
  if (typeof v.weather === "string" && (VISIBILITY_WEATHER_CONDITIONS as readonly string[]).includes(v.weather)) {
    result.weather = v.weather as VisibilityWeatherCondition;
  }
  if (typeof v.calendarKeyword === "string" && v.calendarKeyword.trim()) {
    result.calendarKeyword = v.calendarKeyword.trim();
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Accepts both the new {type,size}[] shape and the old string[] shape (pre-resize presets). */
export function parseWidgets(raw: unknown): PresetWidget[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): PresetWidget | null => {
      if (isWidgetType(item)) return { type: item, size: "md" };
      if (item && typeof item === "object" && isWidgetType((item as { type?: unknown }).type)) {
        const size = isWidgetSize((item as { size?: unknown }).size) ? (item as { size: WidgetSize }).size : "md";
        const visibility = parseVisibility((item as { visibility?: unknown }).visibility);
        return { type: (item as { type: WidgetType }).type, size, ...(visibility ? { visibility } : {}) };
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
    isDefault: Boolean(row.is_default),
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

export async function getDefaultPreset(): Promise<Preset | null> {
  const rows = await d1Query<PresetRow>("SELECT * FROM presets WHERE is_default = 1 LIMIT 1");
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function createPreset(name: string, widgets: PresetWidget[]): Promise<Preset> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await d1Query(
    "INSERT INTO presets (id, name, widgets, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [id, name, JSON.stringify(widgets), now, now]
  );
  return { id, name, widgets, isDefault: false, createdAt: now, updatedAt: now };
}

/** Marks one preset as the default new devices land on. Only one preset can
 * be default at a time, so this clears the flag off every other preset. */
export async function setDefaultPreset(id: string): Promise<Preset | null> {
  const existing = await getPreset(id);
  if (!existing) return null;
  await d1Query("UPDATE presets SET is_default = 0");
  await d1Query("UPDATE presets SET is_default = 1 WHERE id = ?", [id]);
  return getPreset(id);
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
