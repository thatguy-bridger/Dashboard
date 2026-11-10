import { num, obj, str, type InfoSource, type SourceCtx } from "./types.ts";

// state:mail = { "unread": 12, "priority": 2, "missionaries": [{ "name": "Elder Jones", "unread": 1, "last": "Subject", "at": epochSeconds }], "recent": [{ "from": "Name", "subject": "Subject", "at": epochSeconds }] }
export type MailItem = { from: string; subject: string; at?: number; unread: boolean; priority: boolean; missionary?: string };
export type Mail = { items: MailItem[]; today: number; unread: number; priority: number; missionaries: { name: string; unread: number; last?: string; at?: number }[]; recent: { from: string; subject: string; at?: number }[] };
export function parseMail(raw: unknown): Mail | null {
  const o = obj(raw); if (!o) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const m: Mail = {
    today: num(o.today) ?? 0,
    items: list(o.items).flatMap((x) => { const r = obj(x); const f = str(r?.from), sub = str(r?.subject); return r && f && sub ? [{ from: f, subject: sub, at: num(r.at), unread: r.unread === true, priority: r.priority === true, missionary: str(r.missionary) }] : []; }),
    unread: num(o.unread) ?? 0, priority: num(o.priority) ?? 0,
    missionaries: list(o.missionaries).flatMap((x) => { const r = obj(x); const n = str(r?.name); return r && n ? [{ name: n, unread: num(r.unread) ?? 0, last: str(r.last), at: num(r.at) }] : []; }),
    recent: list(o.recent).flatMap((x) => { const r = obj(x); const f = str(r?.from), s = str(r?.subject); return r && f && s ? [{ from: f, subject: s, at: num(r.at) }] : []; }),
  };
  return m;
}
const mailOf = (c: SourceCtx) => parseMail(c.extra.mail);
const missionaryUnread = (m: Mail) => m.missionaries.reduce((a, x) => a + x.unread, 0);

export const mail: InfoSource = {
  id: "mail",
  items: (c) => { const m = mailOf(c); if (!m) return []; const n = m.priority || m.unread; return n > 0 ? [{ id: "mail-badge", zone: "badge", title: "Mail", rail: "mail", count: n }] : []; },
  score: (c) => { const m = mailOf(c); if (!m) return 0; return m.priority > 0 || missionaryUnread(m) > 0 ? 60 : m.unread >= 10 ? 30 : 0; },
  page: { id: "mail", title: "Mail", has: (c) => { const m = mailOf(c); return !!m && (m.unread > 0 || m.missionaries.length > 0 || m.recent.length > 0); } },
};
