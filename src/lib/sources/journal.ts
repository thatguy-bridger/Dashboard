import { num, obj, str, type InfoSource, type SourceCtx } from "./types.ts";

// state:journal = { "due": true, "wroteToday": false, "streak": 12, "best": 40, "prompt": "What made you laugh today?" }
export type Journal = { due: boolean; wroteToday: boolean; streak: number; best: number; prompt?: string };
export function parseJournal(raw: unknown): Journal | null {
  const o = obj(raw); if (!o) return null;
  return { due: o.due === true, wroteToday: o.wroteToday === true, streak: num(o.streak) ?? 0, best: num(o.best) ?? 0, prompt: str(o.prompt) };
}
const journalOf = (c: SourceCtx) => parseJournal(c.extra.journal);

export const journal: InfoSource = {
  id: "journal",
  items: (c) => (journalOf(c)?.due ? [{ id: "journal-dot", zone: "badge", title: "Journal", rail: "journal", dot: true }] : []),
  score: (c) => (journalOf(c)?.due ? 45 : 0),
  page: { id: "journal", title: "Journal", has: (c) => !!journalOf(c) },
};
