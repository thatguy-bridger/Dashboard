import { WIDGET_LABELS, parseVisibility, type WidgetType, type WidgetVisibility } from "@/lib/presets";
import { isWidgetVisible, hasAnyRule, type VisibilityContext } from "@/lib/visibility";

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
  /** Per-item show/hide rules (time, days, weather, calendar keyword). */
  visibility?: WidgetVisibility;
}

interface Def extends StandByItem {
  label: string;
  /** Every item resizes: hand-built pieces scale with their box, widget-backed ones reflow. */
  resizable: boolean;
}

const D = (id: StandByItemId, label: string, enabled: boolean, x: number, y: number, w: number, h: number, resizable: boolean): Def =>
  ({ id, label, enabled, x, y, w, h, resizable });

const widgetLabel = (t: WidgetType) => WIDGET_LABELS[t];

const RAW_DEFS: Def[] = [
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
  D("calendar", "Calendar (full agenda)", false, 480, 100, 480, 780, true),
];

/** Items that start switched off cascade diagonally so toggling several on never stacks them exactly. */
export const STANDBY_DEFS: Def[] = RAW_DEFS.map((d, i) =>
  d.enabled ? d : { ...d, x: d.x + (i % 8) * 28, y: d.y + (i % 8) * 28 }
);


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
    const visibility = parseVisibility(s.visibility);
    return {
      ...(visibility ? { visibility } : {}),
      id: d.id,
      enabled: typeof s.enabled === "boolean" ? s.enabled : d.enabled,
      x: num(s.x, d.x),
      y: num(s.y, d.y),
      w: Math.max(120, num(s.w, d.w)),
      h: Math.max(40, num(s.h, d.h)),
    };
  });
}

// ---------- scenes ----------

/** A named StandBy layout that switches itself on when its schedule matches
 *  (time of day, days, weather, calendar keyword). The first matching scene
 *  wins; with no match the base layout applies. */
export interface StandByScene {
  id: string;
  name: string;
  items: StandByItem[];
  schedule?: WidgetVisibility;
}

/** Everything off, then the listed items on at the given boxes. */
function scene(over: Partial<Record<StandByItemId, Partial<StandByItem>>>): StandByItem[] {
  return defaultStandByLayout().map((d) => {
    const o = over[d.id];
    return o ? { ...d, ...o, enabled: true } : { ...d, enabled: false };
  });
}

export function defaultScenes(): StandByScene[] {
  return [
    {
      id: "scene-rain",
      name: "Rainy day",
      schedule: { weather: "rain" },
      items: scene({
        clock: { x: 60, y: 60, w: 460, h: 220 },
        weather: { x: 60, y: 300, w: 380, h: 112 },
        forecast: { x: 60, y: 430, w: 600, h: 118 },
        radar: { x: 740, y: 100, w: 640, h: 500 },
        agenda: { x: 60, y: 710, w: 1320, h: 130 },
        notifications: { x: 900, y: 14, w: 480, h: 70 },
      }),
    },
    {
      id: "scene-morning",
      name: "Morning",
      schedule: { timeStart: "05:30", timeEnd: "10:00" },
      items: scene({
        weather: { x: 60, y: 100, w: 760, h: 320 },
        forecast: { x: 60, y: 450, w: 800, h: 140 },
        clock: { x: 60, y: 620, w: 400, h: 190 },
        calendar: { x: 900, y: 100, w: 480, h: 740 },
        notifications: { x: 500, y: 640, w: 380, h: 70 },
      }),
    },
    {
      id: "scene-night",
      name: "Night",
      schedule: { timeStart: "22:00", timeEnd: "05:30" },
      items: scene({
        clock: { x: 320, y: 230, w: 800, h: 390 },
        weather: { x: 530, y: 650, w: 380, h: 112 },
      }),
    },
    {
      id: "scene-evening",
      name: "Evening",
      schedule: { timeStart: "17:00", timeEnd: "22:00" },
      items: scene({
        clock: { x: 60, y: 70 },
        weather: { x: 60, y: 382 },
        battery: { x: 60, y: 520 },
        nowplaying: { x: 740, y: 134 },
        agenda: { x: 60, y: 710 },
        notifications: { x: 900, y: 14 },
        sports: { x: 60, y: 590, w: 600, h: 100 },
      }),
    },
  ];
}

export function mergeScenes(raw: unknown): StandByScene[] {
  if (!Array.isArray(raw)) return defaultScenes();
  const out: StandByScene[] = [];
  for (const r of raw) {
    if (!r || typeof r.id !== "string" || typeof r.name !== "string") continue;
    const schedule = parseVisibility(r.schedule);
    out.push({ id: r.id, name: r.name.slice(0, 40), items: mergeStandByLayout(r.items), ...(schedule ? { schedule } : {}) });
  }
  return out;
}

/** First scene whose schedule is set and currently matches; null = base layout. */
export function pickScene(scenes: StandByScene[], ctx: VisibilityContext): StandByScene | null {
  return (
    scenes.find(
      (s) =>
        hasAnyRule(s.schedule) &&
        // a weather-scheduled scene must not flash on before weather has loaded (item rules fail open, scenes don't)
        !(s.schedule?.weather && ctx.weatherCode === null) &&
        isWidgetVisible(s.schedule, ctx)
    ) ?? null
  );
}
