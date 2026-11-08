// The registry. To add a new kind of information: write one small module here (items, score, optional page) and list it below;
// give its page a renderer in src/calm/index.tsx under the same id. Nothing else has to change.
import { agenda } from "./agenda.ts"; import { music } from "./music.ts"; import { weather } from "./weather.ts"; import { away } from "./away.ts";
import { school } from "./school.ts"; import { mail } from "./mail.ts"; import { journal } from "./journal.ts"; import { car } from "./car.ts"; import { battery } from "./battery.ts"; import { life } from "./life.ts";
import type { InfoSource, SourceCtx } from "./types.ts";
import type { SlotItem } from "../slots.ts";

export type { InfoSource, SourceCtx };
export const SOURCES: InfoSource[] = [agenda, music, weather, away, school, mail, journal, car, battery, life];

/** All zone items from every source. */
export const sourceItems = (c: SourceCtx, sources = SOURCES): SlotItem[] => sources.flatMap((s) => s.items(c));
/** How much the most important thing matters right now (0–100) and which source it is. */
export function focusScore(c: SourceCtx, sources = SOURCES): { score: number; top: string | null } {
  let score = 0, top: string | null = null;
  for (const s of sources) { const v = s.score(c); if (v > score) { score = v; top = s.id; } }
  return { score, top };
}
/** The calm-mode pages that have something to show, in a fixed order. The standby page is always there; the rest skip themselves when empty. */
export const calmPages = (c: SourceCtx, sources = SOURCES): string[] => ["standby", ...sources.filter((s) => s.page?.has(c)).map((s) => s.page!.id)];
