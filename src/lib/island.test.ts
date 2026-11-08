import test from "node:test";
import assert from "node:assert/strict";
import { selectIsland, splitSides, fitIsland, type Activity, type IslandMemory } from "./island.ts";
import { buildActivities } from "./activities.ts";
import type { PredMusic } from "./predict.ts";

const act = (id: string, kind: Activity["kind"], score: number, page: Activity["page"], over: Partial<Activity> = {}): Activity => ({ id, kind, score, page, icon: "note", label: id, ...over });
const music = act("music", "music", 80, "music"), event = act("event", "event", 40, "calendar"), away = act("away", "away", 55, "home"), mail = act("mail", "mail", 60, "mail");
const weather = act("weather", "weather", 10, "weather", { value: "43" });
const all = [music, event, away, mail, weather];
const sel = (over: Partial<Parameters<typeof selectIsland>[0]> = {}) => selectIsland({ currentPage: "calendar", activities: all, now: 100_000, ...over });

test("music while on the Calendar page is the main item; on the Music page it is excluded and the next most pressing thing shows", () => {
  assert.equal(sel({ currentPage: "calendar" }).main?.id, "music");
  const onMusic = sel({ currentPage: "music" });
  assert.equal(onMusic.main?.id, "mail");                                     // 60 beats away (55) and the event (40)
  assert.ok(!onMusic.satellites.some((s) => s.id === "music"));
  assert.equal(sel({ currentPage: "mail" }).main?.id, "music");
});
test("the current page's own content is never repeated, as main or as a satellite", () => {
  const s = sel({ currentPage: "home" });
  for (const a of [s.main, ...s.satellites]) assert.ok(a == null || a.page !== "home", String(a?.id));
});
test("weather is always a satellite (never the main item), first in line", () => {
  const s = sel({ activities: [weather], currentPage: "today" });
  assert.equal(s.main, null); assert.equal(s.satellites[0].id, "weather"); assert.equal(s.calm, true);
  assert.equal(sel().satellites[0].id, "weather");
  assert.ok(sel().main?.kind !== "weather");
});
test("nothing pressing: the calm default is the next event as a thin pill, or nothing (a small dot)", () => {
  const calmEvent = act("event", "event", 20, "calendar");
  const s = selectIsland({ currentPage: "today", activities: [calmEvent, weather], now: 1 });
  assert.equal(s.calm, true); assert.equal(s.main?.id, "event");
  const onCalendar = selectIsland({ currentPage: "calendar", activities: [calmEvent, weather], now: 1 });
  assert.equal(onCalendar.main, null); assert.equal(onCalendar.calm, true);
  assert.equal(selectIsland({ currentPage: "today", activities: [], now: 1 }).main, null);
});
test("dwell: a new top item waits out the minimum dwell; once it has dwelt it must beat the old one by the hysteresis margin", () => {
  const prev: IslandMemory = { mainId: "away", since: 100_000 };
  const better = act("mail", "mail", 60, "mail"), clearlyBetter = act("mail", "mail", 70, "mail");
  assert.equal(selectIsland({ currentPage: "today", activities: [away, better], now: 103_000, previous: prev }).main?.id, "away");           // 3 s in: holding
  assert.equal(selectIsland({ currentPage: "today", activities: [away, better], now: 109_000, previous: prev }).main?.id, "away");           // dwelt, but only 5 points better (60 vs 55): hysteresis holds (the margin is 6)
  assert.equal(selectIsland({ currentPage: "today", activities: [away, clearlyBetter], now: 109_000, previous: prev }).main?.id, "mail");    // 15 points better: switches
  assert.equal(selectIsland({ currentPage: "today", activities: [away, act("mail", "mail", 61, "mail")], now: 109_000, previous: prev }).main?.id, "mail");   // exactly the margin: switches
});
test("urgent items (an event starting, an alert) bypass the dwell; a vanished main item is replaced at once", () => {
  const prev: IslandMemory = { mainId: "away", since: 100_000 };
  const urgent = act("event", "event", 90, "calendar", { urgent: true });
  assert.equal(selectIsland({ currentPage: "today", activities: [away, urgent], now: 100_500, previous: prev }).main?.id, "event");
  assert.equal(selectIsland({ currentPage: "today", activities: [act("mail", "mail", 60, "mail")], now: 100_500, previous: prev }).main?.id, "mail");   // away stopped applying
  const memo = selectIsland({ currentPage: "today", activities: [away, urgent], now: 100_500, previous: prev }).memory; assert.equal(memo.mainId, "event"); assert.equal(memo.since, 100_500);
  assert.equal(selectIsland({ currentPage: "today", activities: [away], now: 120_000, previous: { mainId: "away", since: 100_000 } }).memory.since, 100_000);     // unchanged main keeps its start time
});
test("a pinned satellite is the main item until the pin expires", () => {
  const pin = { id: "weather", until: 110_000 };
  assert.equal(sel({ pin, now: 105_000 }).main?.id, "weather");
  assert.equal(sel({ pin, now: 111_000 }).main?.id, "music");
  assert.equal(sel({ pin: { id: "nothing", until: 999_999 } }).main?.id, "music");
});
test("satellites: capped at three per side, one per kind, never the main item, alternating sides", () => {
  const many = [music, away, mail, weather, act("j", "journal", 45, "journal"), act("c", "car", 12, "home"), act("b", "battery", 10, "home"), act("l", "lights", 18, "home"), act("m2", "music", 30, "music", { id: "music2" })];
  const s = selectIsland({ currentPage: "today", activities: many, now: 1 });
  assert.ok(s.satellites.length <= 6); assert.ok(s.left.length <= 3 && s.right.length <= 3);
  assert.equal(new Set(s.satellites.map((x) => x.kind)).size, s.satellites.length);
  assert.ok(!s.satellites.some((x) => x.id === s.main?.id)); assert.ok(!s.satellites.some((x) => x.kind === s.main?.kind));
  assert.equal(s.satellites[0].kind, "weather"); assert.equal(s.right[0].kind, "weather");
  assert.deepEqual(splitSides([weather, mail, away]).left.map((x) => x.id), ["mail"]); assert.deepEqual(splitSides(Array(9).fill(weather)).right.length, 3);
  assert.equal(selectIsland({ currentPage: "today", activities: many, now: 1, maxSatellites: 2 }).satellites.length, 2);
});

const ctx = (over = {}) => ({ now: 1_000_000, scene: "idle" as const, events: [], music: null as PredMusic | null, weather: null, away: false, extra: {} as Record<string, unknown>, soonLeadMin: 15, ...over });
const ev = (min: number, over = {}) => ({ title: "Chemistry", start: 1_000_000 / 1000 + min * 60, end: 1_000_000 / 1000 + (min + 50) * 60, ...over });
test("activities: scores follow the focus-score idea, urgent only when it matters", () => {
  const byId = (a: Activity[], id: string) => a.find((x) => x.id === id)!;
  assert.equal(byId(buildActivities(ctx({ events: [ev(300)] })), "event").score, 20);
  assert.equal(byId(buildActivities(ctx({ events: [ev(120)] })), "event").score, 40);
  assert.equal(byId(buildActivities(ctx({ events: [ev(45)] })), "event").score, 70);
  const soon = byId(buildActivities(ctx({ events: [ev(10)] })), "event"); assert.equal(soon.score, 90); assert.equal(soon.urgent, false); assert.equal(soon.value, "in 10 min");
  assert.equal(byId(buildActivities(ctx({ events: [ev(3)] })), "event").urgent, true); assert.equal(byId(buildActivities(ctx({ events: [ev(-5)] })), "event").value, "now");
  assert.equal(byId(buildActivities(ctx({ events: [ev(10, { allDay: true })] })).concat([{ id: "event" } as never]), "event").id, "event");
  const m: PredMusic = { playing: true, track: "Song", artist: "Art", progress: 0, duration: 100, at: 1_000_000, palette: ["#ff0000"] };
  assert.equal(byId(buildActivities(ctx({ music: m })), "music").score, 80); assert.equal(byId(buildActivities(ctx({ music: m })), "music").tint, "#ff0000");
  assert.equal(byId(buildActivities(ctx({ music: { ...m, playing: false } })), "music").score, 45);
  assert.equal(buildActivities(ctx({ music: { ...m, playing: false, at: 1_000_000 - 200_000 } })).some((x) => x.id === "music"), false);
  assert.equal(byId(buildActivities(ctx({ away: true })), "away").score, 55);
  assert.equal(byId(buildActivities(ctx({ extra: { mail: { unread: 5, priority: 2 } } })), "mail").score, 60); assert.equal(byId(buildActivities(ctx({ extra: { mail: { unread: 5 } } })), "mail").score, 22);
  assert.equal(byId(buildActivities(ctx({ extra: { journal: { due: true } } })), "journal").score, 45);
  assert.equal(byId(buildActivities(ctx({ extra: { car: { fuelPct: 9 } } })), "car").score, 65); assert.equal(byId(buildActivities(ctx({ extra: { battery: { pct: 90 } } })), "battery").score, 10);
  const a = buildActivities(ctx({ weather: { current: { temperature_2m: 43.4, weather_code: 0, is_day: 1 } } }), { musicLights: true, lightsOn: 5, takeover: { id: "g", zone: "takeover", title: "Garage door open", icon: "alert" } });
  assert.deepEqual([byId(a, "weather").value, byId(a, "musiclights").value, byId(a, "lights").value, byId(a, "alert:g").score], ["43°", "on", "5", 100]); assert.equal(byId(a, "alert:g").urgent, true);
  assert.equal(byId(a, "weather").page, "weather");
});

test("an alert is always shown, whatever page you are on", () => {
  const alert = act("alert:g", "alert", 100, "any", { urgent: true });
  for (const page of ["today", "calendar", "music", "home", "mail", "journal"] as const) assert.equal(selectIsland({ currentPage: page, activities: [music, event, alert, weather], now: 1 }).main?.id, "alert:g", page);
  assert.equal(buildActivities(ctx(), { takeover: { id: "g", zone: "takeover", title: "Garage door open" } }).find((a) => a.kind === "alert")?.page, "any");
});

test("fit: satellites are dropped from the outside in before the main pill shrinks, and nothing is ever wider than its region", () => {
  const u = 10.8, base = { unitPx: u, coreUnits: 58, maxPerSide: 3 };
  const wide = fitIsland({ ...base, availPx: 1500 }); assert.equal(wide.perSide, 3); assert.ok(Math.abs(wide.coreUnits - 58) < 1e-6);
  const mid = fitIsland({ ...base, availPx: 1000 }); assert.ok(mid.perSide > 0 && mid.perSide < 3, String(mid.perSide)); assert.ok(Math.abs(mid.coreUnits - 58) < 1e-6);
  const tight = fitIsland({ ...base, availPx: 640 }); assert.equal(tight.perSide, 0); assert.ok(Math.abs(tight.coreUnits - 58) < 1e-6);                  // the pill still fits: no satellites
  const narrow = fitIsland({ ...base, availPx: 300 }); assert.equal(narrow.perSide, 0); assert.ok(narrow.coreUnits * u <= 300 + 0.01 && narrow.coreUnits >= 9);   // now the pill shrinks
  assert.equal(fitIsland({ ...base, availPx: 1500, maxPerSide: 1 }).perSide, 1); assert.equal(fitIsland({ ...base, availPx: 0 }).perSide, 0);
  for (const avail of [200, 400, 700, 900, 1200, 1600]) { const f = fitIsland({ ...base, availPx: avail }); const need = f.coreUnits * u + 2 * f.perSide * (9.8 + 1.8) * u + (f.perSide ? 2 * 1.8 * u : 0); assert.ok(need <= Math.max(avail, 9 * u) + 0.5, `${avail}: needs ${need}`); }
});
