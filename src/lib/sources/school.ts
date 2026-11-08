import { fmtTime } from "../format.ts";
import { num, obj, str, type InfoSource, type SourceCtx } from "./types.ts";

// state:school = { "day": "A", "now": Period|null, "next": Period|null, "periods": Period[] }
// Period = { "period": "3", "class": "Chemistry", "room": "214", "start": epochSeconds, "end": epochSeconds }
export type Period = { period?: string; class: string; room?: string; start: number; end: number };
export type School = { day?: string; now: Period | null; next: Period | null; periods: Period[] };

const period = (v: unknown): Period | null => { const o = obj(v); const c = str(o?.class), s = num(o?.start), e = num(o?.end); return o && c && s != null && e != null ? { class: c, start: s, end: e, period: str(o.period), room: str(o.room) } : null; };
export function parseSchool(raw: unknown): School | null {
  const o = obj(raw); if (!o) return null;
  const periods = Array.isArray(o.periods) ? o.periods.map(period).filter((p): p is Period => !!p) : [];
  const s: School = { day: str(o.day), now: period(o.now), next: period(o.next), periods };
  return s.now || s.next || periods.length ? s : null;
}
export const schoolOf = (c: SourceCtx) => parseSchool(c.extra.school);

export const school: InfoSource = {
  id: "school",
  items: (c) => {
    const s = schoolOf(c); if (!s) return [];
    if (s.now) return [{ id: "school-now", zone: "strip", title: s.now.class, detail: `until ${fmtTime(s.now.end * 1000)}${s.now.room ? ` · room ${s.now.room}` : ""}`, icon: "school", priority: 70, scenes: ["idle", "morning"] }];
    if (s.next) { const m = Math.round((s.next.start * 1000 - c.now) / 60000); if (m <= 90) return [{ id: "school-next", zone: "strip", title: `Next: ${s.next.class}`, detail: `in ${m} min${s.next.room ? ` · room ${s.next.room}` : ""}`, icon: "school", priority: 70, scenes: ["idle", "morning"] }]; }
    return [];
  },
  score: (c) => { const s = schoolOf(c); if (!s) return 0; if (s.next && (s.next.start * 1000 - c.now) / 60000 <= 15) return 70; return s.now ? 40 : 0; },
  page: { id: "school", title: "School", has: (c) => !!schoolOf(c) },
};
