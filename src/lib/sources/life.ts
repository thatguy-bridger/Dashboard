import { obj, str, type InfoSource, type SourceCtx } from "./types.ts";

// state:life = { "stats": [{ "label": "Music today", "value": "2h 10m", "detail": "20 min more than usual", "icon": "note" }] }
export type Stat = { label: string; value: string; detail?: string; icon?: string };
export function parseLife(raw: unknown): Stat[] {
  const o = obj(raw); if (!o || !Array.isArray(o.stats)) return [];
  return o.stats.flatMap((x) => { const r = obj(x); const l = str(r?.label), v = str(r?.value); return r && l && v ? [{ label: l, value: v, detail: str(r.detail), icon: str(r.icon) && /^[a-z-]{2,16}$/.test(str(r.icon)!) ? str(r.icon) : undefined }] : []; }).slice(0, 8);
}
export const life: InfoSource = {
  id: "life",
  items: () => [],
  score: () => 0,
  page: { id: "life", title: "Life", has: (c: SourceCtx) => parseLife(c.extra.life).length > 0 },
};
