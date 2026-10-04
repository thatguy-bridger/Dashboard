import { WIDGET_LABELS, type WidgetType } from "@/lib/presets";

/** StandBy canvas is a fixed 1440x900 design space, scaled to the screen. */
export const SB_W = 1440;
export const SB_H = 900;

export type CustomItemId = "clock" | "weather" | "forecast" | "battery" | "nowplaying" | "agenda" | "notifications";
export type StandByItemId = CustomItemId | Exclude<WidgetType, "clock" | "weather" | "notifications">;

export interface StandByItem {
  id: StandByItemId;
  enabled: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Def extends StandByItem {
  label: string;
  /** Every item resizes: hand-built pieces scale with their box, widget-backed ones reflow. */
  resizable: boolean;
}

const D = (id: StandByItemId, label: string, enabled: boolean, x: number, y: number, w: number, h: number, resizable: boolean): Def =>
  ({ id, label, enabled, x, y, w, h, resizable });

const widgetLabel = (t: WidgetType) => WIDGET_LABELS[t];

export const STANDBY_DEFS: Def[] = [
  D("clock", "Clock & date", true, 60, 70, 620, 300, true),
  D("weather", "Weather", true, 60, 382, 380, 112, true),
  D("forecast", "Hourly forecast", true, 60, 510, 600, 118, true),
  D("battery", "Device batteries (iCloud)", true, 60, 640, 600, 52, true),
  D("nowplaying", "Now playing + lyrics", true, 740, 134, 638, 480, true),
  D("agenda", "Next up (calendar)", true, 60, 710, 1320, 130, true),
  D("notifications", "Notification pills", true, 900, 14, 480, 116, true),
  D("news", widgetLabel("news"), true, 740, 624, 420, 66, true),
  D("stocks", widgetLabel("stocks"), true, 1170, 624, 210, 66, true),
  D("sports", widgetLabel("sports"), false, 740, 300, 400, 220, true),
  D("traffic", widgetLabel("traffic"), false, 740, 300, 400, 260, true),
  D("trafficcamera", widgetLabel("trafficcamera"), false, 740, 300, 400, 260, true),
  D("locations", widgetLabel("locations"), false, 740, 300, 400, 300, true),
  D("gmail", widgetLabel("gmail"), false, 740, 300, 400, 260, true),
  D("drive", widgetLabel("drive"), false, 740, 300, 400, 260, true),
  D("photos", widgetLabel("photos"), false, 740, 300, 400, 260, true),
  D("countdown", widgetLabel("countdown"), false, 480, 400, 240, 160, true),
  D("worldclocks", widgetLabel("worldclocks"), false, 480, 400, 400, 100, true),
  D("airquality", widgetLabel("airquality"), false, 480, 400, 240, 160, true),
  D("history", widgetLabel("history"), false, 480, 400, 400, 120, true),
  D("radar", widgetLabel("radar"), false, 740, 300, 400, 260, true),
  D("lyrics", widgetLabel("lyrics"), false, 1100, 134, 280, 480, true),
  D("calendar", widgetLabel("calendar"), false, 480, 400, 400, 260, true),
];

/** Items that are one row of chips/cards: resizing widens the row (more fits / drifts less)
 *  instead of stretching it. */
export const ROW_ITEMS: StandByItemId[] = ["forecast", "agenda", "battery", "notifications"];
export const STANDBY_DEFAULT_SIZE = Object.fromEntries(STANDBY_DEFS.map((d) => [d.id, { w: d.w, h: d.h }])) as Record<StandByItemId, { w: number; h: number }>;

export const STANDBY_LABELS = Object.fromEntries(STANDBY_DEFS.map((d) => [d.id, d.label])) as Record<StandByItemId, string>;
export const STANDBY_RESIZABLE = Object.fromEntries(STANDBY_DEFS.map((d) => [d.id, d.resizable])) as Record<StandByItemId, boolean>;

export function defaultStandByLayout(): StandByItem[] {
  return STANDBY_DEFS.map(({ id, enabled, x, y, w, h }) => ({ id, enabled, x, y, w, h }));
}

/** Merge a saved (possibly older/partial) layout over the defaults so newly
 *  added items always appear and unknown ids are dropped. */
export function mergeStandByLayout(raw: unknown): StandByItem[] {
  const saved = new Map<string, Partial<StandByItem>>();
  if (Array.isArray(raw)) for (const r of raw) if (r && typeof r.id === "string") saved.set(r.id, r);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return defaultStandByLayout().map((d) => {
    const s = saved.get(d.id);
    if (!s) return d;
    return {
      id: d.id,
      enabled: typeof s.enabled === "boolean" ? s.enabled : d.enabled,
      x: num(s.x, d.x),
      y: num(s.y, d.y),
      w: Math.max(120, num(s.w, d.w)),
      h: Math.max(40, num(s.h, d.h)),
    };
  });
}
