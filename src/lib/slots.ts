// The info-slot system: one place where "more information" gets organised. Anything that has something to say becomes a SlotItem in one
// of four zones; the page only ever draws zones, so adding a new kind of information never means touching a scene.
//   hero      the scene itself (chosen by src/lib/scenes.ts), not an item
//   pill      the small cards at the top (next event, a delivery, a warning)
//   strip     the row along the bottom (what's coming up)
//   badge     a dot or count on a rail icon (unread mail, a journal entry waiting)
//   peek      one extra item in a corner (the most important thing that has no better place)
//   takeover  something urgent: a banner over everything until it expires
// Two sources: built-in providers (computed here from the schedule) and `info` items that Permuta saves (state:info), so new kinds
// of information need no change to this app.
import { until, when } from "./format.ts";
import type { Ev, SceneId } from "./scenes.ts";

export type RailId = "today" | "calendar" | "music" | "home" | "mail" | "journal";
export const RAIL_IDS: RailId[] = ["today", "calendar", "music", "home", "mail", "journal"];
export type Zone = "pill" | "strip" | "badge" | "peek" | "takeover";

export type SlotItem = {
  id: string;
  zone: Zone;
  title: string;
  detail?: string;
  color?: string;               // "#RRGGBB"
  icon?: string;                // a name from the icon set (src/components/Icon.tsx), never an emoji
  priority?: number;            // 0–100, higher first (default 50)
  scenes?: SceneId[];           // only in these scenes (default: all)
  hideIn?: SceneId[];
  rail?: RailId;                // for badges: which rail icon
  count?: number;               // for badges: a number on the icon
  dot?: boolean;                // for badges: just a dot
  until?: number;               // epoch ms: stops showing then
};

export type SlotContext = { now: number; scene: SceneId; events: Ev[]; info: SlotItem[] };
export type Provider = (c: SlotContext) => SlotItem[];

export const nextEventPill: Provider = (c) => {
  const e = c.events[0];
  return e ? [{ id: "next-event", zone: "pill", title: e.title, detail: until(e.start, c.now), color: e.color, priority: 60, scenes: ["idle", "music", "morning", "away"] }] : [];
};
export const upNextStrip: Provider = (c) =>
  c.events.slice(0, 4).map((e, i) => ({ id: `up-${i}`, zone: "strip" as const, title: e.title, detail: when(e, c.now), color: e.color, priority: 100 - i, scenes: ["idle"] as SceneId[] }));

export const BUILTIN: Provider[] = [nextEventPill, upNextStrip];

const ZONES: Zone[] = ["pill", "strip", "badge", "peek", "takeover"];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Tolerant parse of what Permuta saved (state:info): bad items are dropped, odd fields ignored. */
export function normalizeInfo(raw: unknown): SlotItem[] {
  const list = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return [];
  const out: SlotItem[] = [];
  for (const r of list) {
    const o = r as Record<string, unknown> | null;
    if (!o || typeof o.id !== "string" || typeof o.title !== "string" || !ZONES.includes(o.zone as Zone)) continue;
    if (o.zone === "badge" && !RAIL_IDS.includes(o.rail as RailId)) continue;
    const item: SlotItem = { id: o.id, zone: o.zone as Zone, title: o.title };
    if (typeof o.detail === "string") item.detail = o.detail;
    if (typeof o.color === "string" && HEX.test(o.color)) item.color = o.color;
    if (typeof o.icon === "string" && /^[a-z-]{2,16}$/.test(o.icon)) item.icon = o.icon;
    if (typeof o.priority === "number" && isFinite(o.priority)) item.priority = Math.min(100, Math.max(0, o.priority));
    if (Array.isArray(o.scenes)) item.scenes = o.scenes.filter((x): x is SceneId => typeof x === "string") as SceneId[];
    if (Array.isArray(o.hideIn)) item.hideIn = o.hideIn.filter((x): x is SceneId => typeof x === "string") as SceneId[];
    if (typeof o.rail === "string" && RAIL_IDS.includes(o.rail as RailId)) item.rail = o.rail as RailId;
    if (typeof o.count === "number" && isFinite(o.count)) item.count = Math.max(0, Math.round(o.count));
    if (o.dot === true) item.dot = true;
    if (typeof o.until === "number" && isFinite(o.until)) item.until = o.until;
    out.push(item);
  }
  return out;
}

export type Badge = { count?: number; dot?: boolean; color?: string };
export type Slots = { pills: SlotItem[]; strip: SlotItem[]; badges: Partial<Record<RailId, Badge>>; peek: SlotItem | null; takeover: SlotItem | null };

export function collectSlots(c: SlotContext, providers: Provider[] = BUILTIN, limits = { pill: 2, strip: 4 }): Slots {
  const all = [...providers.flatMap((p) => p(c)), ...c.info];
  const live = all.filter((i) => (i.until == null || i.until > c.now) && (!i.scenes || i.scenes.includes(c.scene)) && !i.hideIn?.includes(c.scene));
  const byPriority = (a: SlotItem, b: SlotItem) => (b.priority ?? 50) - (a.priority ?? 50);
  const zone = (z: Zone) => live.filter((i) => i.zone === z).sort(byPriority);
  const badges: Slots["badges"] = {};
  for (const b of zone("badge")) {
    if (!b.rail) continue;
    const cur = badges[b.rail] ?? {};
    badges[b.rail] = { count: (cur.count ?? 0) + (b.count ?? 0) || undefined, dot: cur.dot || !!b.dot || (b.count ?? 0) > 0, color: cur.color ?? b.color };
  }
  return { pills: zone("pill").slice(0, limits.pill), strip: zone("strip").slice(0, limits.strip), badges, peek: zone("peek")[0] ?? null, takeover: zone("takeover")[0] ?? null };
}

/** Which rail icon is highlighted for a scene. */
export const railFor = (scene: SceneId): RailId | null => ({ idle: "today", morning: "today", soon: "calendar", day: "calendar", music: "music", away: "home", night: null, offline: null } as Record<SceneId, RailId | null>)[scene];
