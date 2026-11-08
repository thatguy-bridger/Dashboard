// Text helpers for times and countdowns (pure).

// 12-hour by default; the page sets this from config:screen.hours24 (Permuta's Screens tab). false/absent = 12h with AM/PM, true = 24h with no suffix.
let H24 = false;
export const setHours24 = (v: boolean | undefined | null) => { H24 = v === true; };
export const getHours24 = () => H24;
const pad2 = (n: number) => String(n).padStart(2, "0");

export const fmtClock = (ms: number, hours24 = H24) => {
  const d = new Date(ms);
  const h = d.getHours(), m = pad2(d.getMinutes());
  return hours24 ? { time: `${pad2(h)}:${m}`, ampm: "" } : { time: `${h % 12 || 12}:${m}`, ampm: h >= 12 ? "PM" : "AM" };
};
export const fmtTime = (ms: number, hours24 = H24) => { const d = new Date(ms); const h = d.getHours(), m = pad2(d.getMinutes()); return hours24 ? `${pad2(h)}:${m}` : `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`; };
/** Short hour label for the timeline axis: "9a" / "12p", or "09" / "13" in 24h. */
export const hourLabel = (h: number, hours24 = H24) => (hours24 ? pad2(h % 24) : `${h % 12 || 12}${h % 24 >= 12 ? "p" : "a"}`);

export function until(startSec: number, now: number): string {
  const mins = Math.round((startSec * 1000 - now) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `in ${h}h ${mins % 60}m` : `in ${Math.floor(h / 24)}d`;
}

const startOfDay = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
export function dayLabel(ms: number, now: number): string {
  const diff = Math.round((startOfDay(ms) - startOfDay(now)) / 864e5);
  return diff <= 0 ? "Today" : diff === 1 ? "Tomorrow" : new Date(ms).toLocaleDateString([], { weekday: "long" });
}
export function when(e: { start: number; end: number; allDay?: boolean }, now: number, hours24 = H24): string {
  const s = e.start * 1000, en = e.end * 1000;
  return e.allDay ? `${dayLabel(s, now)} · all day` : `${dayLabel(s, now)} ${fmtTime(s, hours24)} – ${fmtTime(en, hours24)}`;
}
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
export function countdown(sec: number): string {          // "12:05" or "1:02:05" for the soon scene
  const s = Math.max(0, Math.round(sec)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
