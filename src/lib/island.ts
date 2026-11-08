// The dynamic island: ONE main item (the most pressing thing from OTHER pages) with small satellites beside it. This file is the pure selector.
// "Other pages": whatever the user is looking at already is never repeated in the island, so on the Calendar page a playing song is the main item,
// and on the Music page the song is excluded and the next most pressing thing takes its place.

export type IslandPage = "today" | "calendar" | "music" | "home" | "mail" | "journal" | "weather" | "any";                 // "weather" and "any" belong to no page: always available
export type ActivityKind = "music" | "event" | "away" | "mail" | "journal" | "car" | "battery" | "lights" | "musiclights" | "alert" | "weather";
export type Activity = {
  id: string; kind: ActivityKind; score: number;           // 0 to 100, the same idea as the focus score
  page: IslandPage;                                         // the page this belongs to ("weather" and "any" are no page: always available)
  icon: string;                                             // a name from the icon set
  label: string; value?: string;                            // short text for the main item; `value` alone for a satellite
  detail?: string;                                          // longer text, shown only in the expanded card
  urgent?: boolean;                                         // bypasses the minimum dwell (an event starting, an alert)
  tint?: string;                                            // a colour for the glow (the song's palette)
};
export type IslandMemory = { mainId: string | null; since: number };
export type IslandPin = { id: string; until: number };

export const ISLAND_DEFAULTS = { dwellMs: 8000, hysteresis: 6, mainMin: 35, maxSatellites: 6 };      // 6 = three per side
export type IslandSelection = { main: Activity | null; calm: boolean; satellites: Activity[]; left: Activity[]; right: Activity[]; memory: IslandMemory; reason: string };

/** Satellites alternate sides, most important nearest the island: right, left, right, left... (three per side at most). */
export function splitSides(sats: Activity[]): { left: Activity[]; right: Activity[] } {
  const left: Activity[] = [], right: Activity[] = [];
  sats.slice(0, 6).forEach((s, i) => (i % 2 === 0 ? right : left).push(s));
  return { left, right };
}

export function selectIsland(o: {
  currentPage: IslandPage | null; activities: Activity[]; now: number; previous?: IslandMemory | null; pin?: IslandPin | null;
  dwellMs?: number; hysteresis?: number; mainMin?: number; maxSatellites?: number;
}): IslandSelection {
  const dwell = o.dwellMs ?? ISLAND_DEFAULTS.dwellMs, hyst = o.hysteresis ?? ISLAND_DEFAULTS.hysteresis, min = o.mainMin ?? ISLAND_DEFAULTS.mainMin, cap = o.maxSatellites ?? ISLAND_DEFAULTS.maxSatellites;
  const prev = o.previous ?? { mainId: null, since: 0 };
  // never repeat what the current page already shows
  const cands = o.activities.filter((a) => a.page === "weather" || a.page === "any" || a.page !== o.currentPage).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const pool = cands.filter((a) => a.kind !== "weather");                                 // weather is a satellite, never the main item
  const top = pool[0] && pool[0].score >= min ? pool[0] : null;
  const byId = (id: string | null) => (id ? pool.find((a) => a.id === id) ?? null : null);

  let main: Activity | null = null, reason = "nothing is pressing";
  const pinned = o.pin && o.pin.until > o.now ? byId(o.pin.id) ?? (cands.find((a) => a.id === o.pin!.id) ?? null) : null;
  if (pinned) { main = pinned; reason = "pinned"; }
  else {
    const kept = byId(prev.mainId);
    if (!top) {                                                                            // nothing pressing: keep what's there until it stops applying, else the calm default
      main = kept && kept.score >= min ? kept : null; reason = main ? "kept" : "nothing is pressing";
    } else if (!kept || kept.score < min) { main = top; reason = "most pressing"; }       // what was there no longer applies: switch at once
    else if (top.id === kept.id) { main = kept; reason = "still the most pressing"; }
    else if (top.urgent) { main = top; reason = "urgent"; }
    else if (o.now - prev.since < dwell) { main = kept; reason = "holding (minimum dwell)"; }
    else if (top.score >= kept.score + hyst) { main = top; reason = "most pressing"; }
    else { main = kept; reason = "holding (hysteresis)"; }
  }
  const calm = !main;
  if (calm) main = pool.find((a) => a.kind === "event") ?? null;                           // the calm default: a thin pill with the next event (or nothing: a small dot)

  // satellites: weather first, then by score; one per kind; never the main item, never a duplicate
  const used = new Set<string>(main ? [main.kind] : []);
  const sats: Activity[] = [];
  for (const a of [...cands.filter((x) => x.kind === "weather"), ...cands.filter((x) => x.kind !== "weather")]) {
    if (sats.length >= cap) break;
    if (main && a.id === main.id) continue;
    if (used.has(a.kind)) continue;
    used.add(a.kind); sats.push(a);
  }
  const sides = splitSides(sats);
  const nextId = main && !calm ? main.id : calm ? null : null;
  return { main, calm, satellites: sats, ...sides, memory: { mainId: nextId, since: nextId === prev.mainId ? prev.since : o.now }, reason };
}

/** How much of the island fits in its header region: satellites are dropped from the outside in before the main pill shrinks (and the pill never goes below a small round chip). */
export function fitIsland(o: { availPx: number; unitPx: number; coreUnits: number; maxPerSide: number; satUnits?: number; gapUnits?: number }): { coreUnits: number; perSide: number } {
  const sat = (o.satUnits ?? 9.8) * o.unitPx, gap = (o.gapUnits ?? 1.8) * o.unitPx;
  const core = Math.min(o.coreUnits * o.unitPx, Math.max(0, o.availPx));
  const room = o.availPx - core - 2 * gap;
  const perSide = room > 0 ? Math.max(0, Math.min(3, o.maxPerSide, Math.floor(room / (2 * (sat + gap))))) : 0;
  return { coreUnits: Math.max(9, core / o.unitPx), perSide };
}
