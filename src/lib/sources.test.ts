import test from "node:test";
import assert from "node:assert/strict";
import { SOURCES, focusScore, calmPages, sourceItems, type SourceCtx } from "./sources/index.ts";
import { parseSchool } from "./sources/school.ts"; import { parseMail } from "./sources/mail.ts"; import { parseJournal } from "./sources/journal.ts"; import { parseCar } from "./sources/car.ts"; import { parseBattery } from "./sources/battery.ts"; import { parseLife } from "./sources/life.ts";
import { collectSlots } from "./slots.ts";
import { decideMode, rotation, resolveFocus } from "./focus.ts";

const now = new Date(2026, 10, 7, 13, 0).getTime();
const ev = (title: string, min: number, over = {}) => ({ title, start: now / 1000 + min * 60, end: now / 1000 + (min + 30) * 60, ...over });
const ctx = (over: Partial<SourceCtx> = {}): SourceCtx => ({ now, scene: "idle", events: [], music: null, weather: null, away: false, extra: {}, soonLeadMin: 15, ...over });
const wx = { current: { temperature_2m: 47, weather_code: 2, is_day: 1 }, daily: { time: ["2026-11-07"], temperature_2m_max: [55], temperature_2m_min: [38], weather_code: [2] } };

test("nothing going on: score 0 and only the always-there pages", () => {
  assert.deepEqual(focusScore(ctx()), { score: 0, top: null });
  assert.deepEqual(calmPages(ctx()), ["standby"]);
});
test("scores: event soon, music, away, mail, journal, school, low car/battery", () => {
  assert.equal(focusScore(ctx({ events: [ev("A", 10)] })).score, 90);
  assert.equal(focusScore(ctx({ events: [ev("A", 45)] })).score, 60);
  assert.equal(focusScore(ctx({ events: [ev("A", 600)] })).score, 0);
  assert.equal(focusScore(ctx({ events: [ev("A", 10, { allDay: true })] })).score, 0);
  assert.equal(focusScore(ctx({ music: { playing: true, track: "x", artist: "y", progress: 0, duration: 100, at: now } })).top, "music");
  assert.equal(focusScore(ctx({ away: true })).score, 55);
  assert.equal(focusScore(ctx({ extra: { mail: { unread: 3, priority: 1 } } })).score, 60);
  assert.equal(focusScore(ctx({ extra: { mail: { unread: 3, priority: 0 } } })).score, 0);
  assert.equal(focusScore(ctx({ extra: { journal: { due: true } } })).score, 45);
  assert.equal(focusScore(ctx({ extra: { car: { fuelPct: 10 } } })).score, 65);
  assert.equal(focusScore(ctx({ extra: { battery: { pct: 12, charging: false } } })).score, 55);
  assert.equal(focusScore(ctx({ extra: { battery: { pct: 12, charging: true } } })).score, 0);
  assert.equal(focusScore(ctx({ extra: { school: { next: { class: "Chem", start: now / 1000 + 600, end: now / 1000 + 3000 } } } })).score, 70);
});
test("calm pages skip themselves when they have nothing", () => {
  assert.deepEqual(calmPages(ctx({ weather: wx })), ["standby", "weather"]);
  const full = ctx({ weather: wx, events: [ev("Chem", 120)], extra: { school: { periods: [{ class: "Chem", start: 1, end: 2 }] }, mail: { unread: 2 }, journal: { streak: 3 }, life: { stats: [{ label: "Music", value: "1h" }] } } });
  assert.deepEqual(calmPages(full), ["standby", "today", "weather", "school", "mail", "journal", "life"]);
  assert.deepEqual(calmPages(ctx({ extra: { mail: { unread: 0, missionaries: [], recent: [] } } })), ["standby"]);
});
test("zone items from sources land in the right zones", () => {
  const c = ctx({ weather: wx, away: true, scene: "music", events: [ev("A", 90)], extra: { mail: { unread: 4 }, journal: { due: true }, car: { fuelPct: 9, locked: false }, battery: { pct: 8 } } });
  const s = collectSlots({ now, scene: "music", events: c.events, info: sourceItems(c) }, []);
  assert.deepEqual(s.pills.map((p) => p.id), ["car-low", "battery-low"]);                       // two pills max, most important first
  assert.equal(s.badges.mail?.count, 4); assert.equal(s.badges.journal?.dot, true); assert.equal(s.badges.home?.dot, true);
  assert.equal(s.peek?.id, "car-unlocked");
  assert.ok(collectSlots({ now, scene: "music", events: c.events, info: sourceItems(ctx({ weather: wx, scene: "music" })) }, []).pills.some((p) => p.id === "weather"));
});
test("severe weather becomes an alert pill in every scene", () => {
  const storm = { current: { temperature_2m: 50, weather_code: 95, is_day: 1 } };
  const items = sourceItems(ctx({ weather: storm, scene: "soon" }));
  assert.ok(collectSlots({ now, scene: "soon", events: [], info: items }, []).pills.some((p) => p.id === "weather-alert"));
  assert.equal(focusScore(ctx({ weather: storm })).score, 55);
});
test("each source parses tolerantly: garbage in, null or empty out", () => {
  for (const f of [parseSchool, parseMail, parseJournal, parseCar, parseBattery]) { assert.equal(f(null), null); assert.equal(f("x"), null); assert.equal(f([]), null); }
  assert.deepEqual(parseLife(null), []); assert.deepEqual(parseLife({ stats: [{ label: "a" }, { label: "b", value: "1", icon: "NOTE!" }] }).map((s) => [s.label, s.icon]), [["b", undefined]]);
  assert.equal(parseSchool({ now: { class: "x", start: 1, end: 2 }, periods: [{ nope: 1 }] })?.periods.length, 0);
  assert.equal(parseBattery({ pct: 400 })?.pct, 100);
  assert.equal(parseMail({ missionaries: [{ name: "Elder", unread: 2 }, { unread: 1 }] })?.missionaries.length, 1);
  assert.equal(parseCar({ lastDrive: { miles: 3 } })?.lastDrive, undefined);
});
test("registry: every source has a unique id and a page id that's unique too", () => {
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length);
  const pages = SOURCES.flatMap((s) => (s.page ? [s.page.id] : []));
  assert.equal(new Set(pages).size, pages.length);
});

test("mode: calm needs a quiet idle for a while; anything pressing returns to focus at once; no flicker around the threshold", () => {
  const cfg = resolveFocus({ calmAfterSec: 60 });
  let st = decideMode(null, { scene: "idle", score: 0, now: 0, cfg });
  assert.equal(st.mode, "focus");                                            // starts in focus, waiting
  st = decideMode(st, { scene: "idle", score: 0, now: 30_000, cfg }); assert.equal(st.mode, "focus");
  st = decideMode(st, { scene: "idle", score: 45, now: 40_000, cfg }); assert.equal(st.mode, "focus"); assert.equal(st.calmFrom, null);   // 45 is inside the margin: the wait restarts
  st = decideMode(st, { scene: "idle", score: 0, now: 50_000, cfg });
  st = decideMode(st, { scene: "idle", score: 0, now: 100_000, cfg }); assert.equal(st.mode, "focus");
  st = decideMode(st, { scene: "idle", score: 0, now: 111_000, cfg }); assert.equal(st.mode, "calm");
  st = decideMode(st, { scene: "idle", score: 45, now: 120_000, cfg }); assert.equal(st.mode, "calm");     // once calm, only the threshold itself ends it
  st = decideMode(st, { scene: "idle", score: 50, now: 130_000, cfg }); assert.equal(st.mode, "focus");
  assert.equal(decideMode({ mode: "calm", since: 0, calmFrom: 0 }, { scene: "music", score: 0, now: 5, cfg }).mode, "focus");
  assert.equal(decideMode({ mode: "calm", since: 0, calmFrom: 0 }, { scene: "soon", score: 0, now: 5, cfg }).mode, "focus");
  assert.equal(resolveFocus({ focusThreshold: -5, pageSec: 1 }).focusThreshold, 1); assert.equal(resolveFocus(null).pageSec, 20);
});
test("rotation: derived from the clock, steady, wraps, one page stays put", () => {
  const pages = ["standby", "today", "weather"];
  assert.equal(rotation(pages, 0, 20).id, "standby"); assert.equal(rotation(pages, 19_999, 20).id, "standby"); assert.equal(rotation(pages, 20_000, 20).id, "today");
  assert.equal(rotation(pages, 60_000, 20).id, "standby"); assert.equal(rotation(["standby"], 123456, 20).id, "standby"); assert.equal(rotation([], 5, 20).index, 0);
});
