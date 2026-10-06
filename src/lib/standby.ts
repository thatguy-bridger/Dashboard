import { WIDGET_LABELS, parseVisibility, type WidgetType, type WidgetVisibility } from "@/lib/presets";
import { isWidgetVisible, hasAnyRule, type VisibilityContext } from "@/lib/visibility";

/** StandBy canvas is a fixed 1440x900 design space, scaled to the screen. */
export const SB_W = 1440;
export const SB_H = 900;

export type CustomItemId = "clock" | "weatherhero" | "daysummary" | "upnext" | "tomorrow" | "weather" | "forecast" | "battery" | "nowplaying" | "agenda" | "notifications";
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
  D("clock", "Clock & date", true, 60, 128, 620, 300, true),
  D("weather", "Weather", true, 60, 440, 380, 112, true),
  D("weatherhero", "Weather (detailed, large)", false, 60, 100, 820, 640, true),
  D("daysummary", "Day summary (what to expect)", false, 60, 760, 830, 130, true),
  D("upnext", "Up next (live countdown)", false, 60, 400, 640, 200, true),
  D("tomorrow", "Tomorrow preview", false, 60, 400, 560, 300, true),
  D("forecast", "Hourly forecast", true, 60, 568, 600, 118, true),
  D("battery", "Device batteries (large chips)", false, 60, 618, 620, 84, true),
  D("nowplaying", "Now playing + lyrics", true, 740, 134, 638, 480, true),
  D("agenda", "Next up (calendar)", true, 60, 710, 1320, 130, true),
  D("notifications", "Notification pills", true, 900, 70, 480, 60, true),
  D("news", widgetLabel("news"), true, 740, 624, 420, 66, true),
  D("stocks", widgetLabel("stocks"), true, 1170, 624, 210, 66, true),
  D("sports", widgetLabel("sports"), false, 60, 600, 620, 100, true),
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
export const ROW_ITEMS: StandByItemId[] = ["forecast", "agenda", "battery", "notifications", "daysummary", "sports"];
export const STANDBY_DEFAULT_SIZE = Object.fromEntries(STANDBY_DEFS.map((d) => [d.id, { w: d.w, h: d.h }])) as Record<StandByItemId, { w: number; h: number }>;

/** Lists that reflow: scale by width and use however much height the box has. */
export const WIDTH_FIT_ITEMS: StandByItemId[] = ["calendar", "tomorrow"];
/** Items that can soak up extra screen width (rows, lists, the clock) instead of just moving. */
export const STRETCH_ITEMS: StandByItemId[] = [...ROW_ITEMS, ...WIDTH_FIT_ITEMS, "clock"];

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
  /** 0-1 black overlay (night-time dimming). */
  dim?: number;
  /** Pure black background: no photo, no album-art backdrop. */
  blackBg?: boolean;
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
        clock: { x: 60, y: 110, w: 460, h: 220 },
        weather: { x: 60, y: 350, w: 380, h: 112 },
        forecast: { x: 60, y: 480, w: 600, h: 118 },
        radar: { x: 740, y: 100, w: 640, h: 500 },
        agenda: { x: 60, y: 710, w: 1320, h: 130 },
        notifications: { x: 900, y: 70, w: 480, h: 60 },
      }),
    },
    {
      id: "scene-morning",
      name: "Morning",
      schedule: { timeStart: "05:30", timeEnd: "10:00" },
      items: scene({
        weatherhero: { x: 50, y: 96, w: 840, h: 650 },
        daysummary: { x: 50, y: 764, w: 840, h: 120 },
        clock: { x: 930, y: 80, w: 450, h: 190 },
        calendar: { x: 930, y: 312, w: 450, h: 568 },
      }),
    },
    {
      id: "scene-night",
      name: "Night",
      schedule: { timeStart: "22:00", timeEnd: "05:30" },
      // As dark as it gets: black background, content just barely lit.
      dim: 0.82,
      blackBg: true,
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
        clock: { x: 60, y: 128 },
        weather: { x: 60, y: 440 },
        nowplaying: { x: 740, y: 134 },
        agenda: { x: 60, y: 710 },
        notifications: { x: 900, y: 70, w: 480, h: 60 },
        sports: { x: 60, y: 600, w: 620, h: 100 },
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
    const dim = typeof r.dim === "number" && r.dim > 0 ? Math.min(0.9, r.dim) : undefined;
    out.push({
      id: r.id,
      name: r.name.slice(0, 40),
      items: mergeStandByLayout(r.items),
      ...(schedule ? { schedule } : {}),
      ...(dim ? { dim } : {}),
      ...(r.blackBg ? { blackBg: true } : {}),
    });
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

// ---------- personal-screen template ----------

/** A StandBy that follows the day: what you need at each point, not just content.
 *  Intended for a bedroom/desk screen. Apply from the editor ("Load personal template"). */
export function personalScenes(): StandByScene[] {
  return [
    {
      id: "p-wake",
      name: "Wake up",
      schedule: { timeStart: "05:30", timeEnd: "09:30" },
      items: scene({
        weatherhero: { x: 50, y: 96, w: 840, h: 650 },
        daysummary: { x: 50, y: 764, w: 840, h: 120 },
        clock: { x: 930, y: 80, w: 450, h: 190 },
        upnext: { x: 930, y: 312, w: 450, h: 150 },
        calendar: { x: 930, y: 476, w: 450, h: 404 },
      }),
    },
    {
      id: "p-work",
      name: "Workday",
      schedule: { timeStart: "09:30", timeEnd: "17:00", days: [1, 2, 3, 4, 5] },
      items: scene({
        clock: { x: 60, y: 70, w: 520, h: 250 },
        weather: { x: 60, y: 340, w: 380, h: 112 },
        upnext: { x: 700, y: 110, w: 680, h: 230 },
        calendar: { x: 700, y: 360, w: 680, h: 500 },
        notifications: { x: 60, y: 520, w: 560, h: 116 },
      }),
    },
    {
      id: "p-evening",
      name: "Evening",
      schedule: { timeStart: "17:00", timeEnd: "22:00" },
      items: scene({
        clock: { x: 60, y: 128 },
        weather: { x: 60, y: 440 },
        forecast: { x: 60, y: 568 },
        nowplaying: { x: 740, y: 134 },
        upnext: { x: 740, y: 640, w: 640, h: 130 },
        notifications: { x: 900, y: 70, w: 480, h: 60 },
      }),
    },
    {
      id: "p-wind-down",
      name: "Wind down",
      schedule: { timeStart: "22:00", timeEnd: "05:30" },
      dim: 0.82,
      blackBg: true,
      items: scene({
        clock: { x: 300, y: 120, w: 840, h: 380 },
        tomorrow: { x: 450, y: 540, w: 540, h: 300 },
      }),
    },
    {
      id: "p-full",
      name: "Full content (manual)",
      items: defaultStandByLayout().map((i) => ({
        ...i,
        enabled: ["clock", "weather", "forecast", "nowplaying", "agenda", "notifications", "news", "stocks"].includes(i.id),
      })),
    },
  ];
}
