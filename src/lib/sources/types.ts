import type { Ev, SceneId } from "../scenes.ts";
import type { SlotItem } from "../slots.ts";
import type { Music, Weather } from "../types.ts";

// An info source is ONE small module: what it can show in the zones (items), how much it matters right now (score 0–100, the same idea as Permuta's
// importance score), and optionally a calm-mode page (has + a renderer registered under the same id in src/calm). Adding a new kind of
// information = one new file here, listed in ./index.ts.
export type SourceCtx = {
  now: number;
  scene: SceneId;
  events: Ev[];                                  // upcoming, soonest first
  music: Music | null;
  weather: Weather | null;
  away: boolean;
  extra: Record<string, unknown>;                // raw state:* rows Permuta saved, by name (school, mail, journal, car, battery, life …)
  soonLeadMin: number;
};
export type InfoSource = {
  id: string;
  items(c: SourceCtx): SlotItem[];
  score(c: SourceCtx): number;
  page?: { id: string; title: string; has(c: SourceCtx): boolean };
};

export const num = (v: unknown): number | undefined => (typeof v === "number" && isFinite(v) ? v : undefined);
export const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
export const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
