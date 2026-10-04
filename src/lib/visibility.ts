import type { WidgetVisibility, VisibilityWeatherCondition } from "@/lib/presets";

export interface VisibilityContext {
  now: Date;
  /** Current WMO weather code, or null if not loaded/unavailable yet —
   * null never fails a weather rule (fails open rather than hiding a
   * widget because of a transient fetch miss). */
  weatherCode: number | null;
  /** Titles of events starting today, from /api/calendar. */
  todaysEventTitles: string[];
}

function weatherGroupOf(code: number): VisibilityWeatherCondition {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "cloudy";
  if (code >= 51 && code <= 65) return "rain";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 71 && code <= 75) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

function minutesSinceMidnight(time: string): number | null {
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function withinTimeRange(now: Date, start?: string, end?: string): boolean {
  if (!start || !end) return true;
  const startMin = minutesSinceMidnight(start);
  const endMin = minutesSinceMidnight(end);
  if (startMin === null || endMin === null) return true;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // A range that wraps past midnight (e.g. 22:00-06:00) can't be checked
  // with a plain start <= now <= end comparison.
  if (startMin <= endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin;
}

/** Every rule set on the widget must pass — see WidgetVisibility for why
 * this is AND-only. A widget with no visibility rules is always shown. */
export function isWidgetVisible(visibility: WidgetVisibility | undefined, ctx: VisibilityContext): boolean {
  if (!visibility) return true;

  if (visibility.days && !visibility.days.includes(ctx.now.getDay())) return false;

  if (!withinTimeRange(ctx.now, visibility.timeStart, visibility.timeEnd)) return false;

  if (visibility.weather) {
    if (ctx.weatherCode === null) return true; // fail open until weather loads
    if (weatherGroupOf(ctx.weatherCode) !== visibility.weather) return false;
  }

  if (visibility.calendarKeyword) {
    const keyword = visibility.calendarKeyword.toLowerCase();
    const hasMatch = ctx.todaysEventTitles.some((title) => title.toLowerCase().includes(keyword));
    if (!hasMatch) return false;
  }

  return true;
}

export function visibilityNeedsWeather(widgets: { visibility?: WidgetVisibility }[]): boolean {
  return widgets.some((w) => w.visibility?.weather);
}

export function visibilityNeedsCalendar(widgets: { visibility?: WidgetVisibility }[]): boolean {
  return widgets.some((w) => w.visibility?.calendarKeyword);
}

/** True when a rule set actually constrains something. */
export function hasAnyRule(v: WidgetVisibility | undefined): boolean {
  return Boolean(v && (v.timeStart || v.timeEnd || v.days?.length || v.weather || v.calendarKeyword));
}
