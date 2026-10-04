import { d1Query } from "@/lib/d1";

/** Events pushed from the Mac's own Calendar (EventKit), which sees every account the
 *  Calendar app does: iCloud, Google, Exchange/Microsoft, subscribed calendars. */
export interface MacEvent {
  summary: string;
  /** ISO datetime with offset, or YYYY-MM-DD for all-day. */
  start: string;
  /** Same format; all-day ends are exclusive (the day after). */
  end?: string;
  allDay: boolean;
  calendarId: string;
  calendar: string;
  color: string | null;
}

export interface MacCalendarInfo {
  /** `${account}|${calendar}` — names alone repeat across accounts ("Work", "Calendar"). */
  id: string;
  name: string;
  account: string;
  color: string | null;
}

export interface MacCalendarData {
  updatedAt: number;
  events: MacEvent[];
  calendars: MacCalendarInfo[];
}

const DATA_KEY = "macCalendar";
const HIDDEN_KEY = "calendarHidden";

async function getKey(key: string): Promise<string | null> {
  const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [key]);
  return rows[0]?.value ?? null;
}

async function setKey(key: string, value: string | null) {
  await d1Query(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function getMacCalendar(): Promise<MacCalendarData | null> {
  const raw = await getKey(DATA_KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (!Array.isArray(d.events) || !Array.isArray(d.calendars)) return null;
    return d as MacCalendarData;
  } catch {
    return null;
  }
}

export async function saveMacCalendar(data: MacCalendarData) {
  await setKey(DATA_KEY, JSON.stringify(data));
}

export async function getHiddenCalendars(): Promise<string[]> {
  try {
    const arr = JSON.parse((await getKey(HIDDEN_KEY)) ?? "[]");
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function setHiddenCalendars(ids: string[]) {
  await setKey(HIDDEN_KEY, JSON.stringify(ids));
}

/** Mac data counts as live for a day and a half, so a sleeping Mac doesn't blank the screens. */
export const MAC_FRESH_MS = 36 * 60 * 60 * 1000;
