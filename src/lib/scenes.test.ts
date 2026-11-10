import test from "node:test";
import assert from "node:assert/strict";
import { decide, settle, resolveConfig, inWindow, soonEvent, DEFAULTS, type SceneInput, type Ev } from "./scenes.ts";

const at = (h: number, m = 0) => new Date(2026, 10, 7, h, m).getTime();            // local time on Sat 7 Nov 2026
const fresh = (now: number) => Math.floor(now / 1000) - 10;
const base = (now: number, over: Partial<SceneInput> = {}): SceneInput => ({ now, events: [], music: null, away: false, statusAt: fresh(now), apiOk: true, hasData: true, ...over });
const ev = (now: number, minFromNow: number, over: Partial<Ev> = {}): Ev => ({ title: "Chemistry", start: Math.floor(now / 1000) + minFromNow * 60, end: Math.floor(now / 1000) + (minFromNow + 50) * 60, ...over });

test("midday with nothing going on is idle", () => assert.equal(decide(base(at(13))).scene, "idle"));
test("no data yet is idle, not offline", () => assert.equal(decide(base(at(13), { hasData: false, statusAt: null, apiOk: false })).scene, "idle"));

test("music playing shows the music scene; paused a moment ago keeps it; paused long ago does not", () => {
  const now = at(15);
  assert.equal(decide(base(now, { music: { playing: true, track: "x", at: now } })).scene, "music");
  assert.equal(decide(base(now, { music: { playing: false, track: "x", at: now - 30000 } })).scene, "music");
  assert.equal(decide(base(now, { music: { playing: false, track: "x", at: now - 5 * 60000 } })).scene, "idle");
  assert.equal(decide(base(now, { music: { playing: true, track: "", at: now } })).scene, "idle");
});

test("soon: takes over inside the lead time, stays after the start, ends after the stay", () => {
  const now = at(9, 30);
  assert.equal(decide(base(now, { events: [ev(now, 14)] })).scene, "soon");
  assert.equal(decide(base(now, { events: [ev(now, 16)] })).scene, "idle");
  assert.equal(decide(base(now, { events: [ev(now, -4)] })).scene, "soon");
  assert.equal(decide(base(now, { events: [ev(now, -6)] })).scene, "idle");
  assert.equal(decide(base(now, { events: [ev(now, 10)] })).focus?.title, "Chemistry");
});
test("soon beats music, and ignores all-day and background events", () => {
  const now = at(9, 30);
  const m = { playing: true, track: "x", at: now };
  assert.equal(decide(base(now, { music: m, events: [ev(now, 5)] })).scene, "soon");
  assert.equal(decide(base(now, { music: m, events: [ev(now, 5, { allDay: true })] })).scene, "music");
  assert.equal(decide(base(now, { music: m, events: [ev(now, 5, { tier: 0 })] })).scene, "music");
  assert.equal(soonEvent([ev(now, 5, { title: "B" }), ev(now, 2, { title: "A" })], now, resolveConfig())?.title, "A");
});
test("soon lead time and minimum tier come from config", () => {
  const now = at(9, 30);
  assert.equal(decide(base(now, { events: [ev(now, 40)], config: { soonLeadMin: 45 } })).scene, "soon");
  assert.equal(decide(base(now, { events: [ev(now, 5)], config: { soonMinTier: 2 } })).scene, "idle");
  assert.equal(decide(base(now, { events: [ev(now, 5, { tier: 3 })], config: { soonMinTier: 2 } })).scene, "soon");
});

test("away", () => {
  const now = at(14);
  assert.equal(decide(base(now, { away: true })).scene, "away");
  assert.equal(decide(base(now, { away: true, music: { playing: true, track: "x", at: now } })).scene, "away");
  assert.equal(decide(base(now, { away: true, events: [ev(now, 5)] })).scene, "soon");   // an event you can still make beats away
});

test("night window wraps midnight and is dim", () => {
  assert.equal(inWindow(23, 22, 6), true); assert.equal(inWindow(3, 22, 6), true); assert.equal(inWindow(6, 22, 6), false); assert.equal(inWindow(12, 22, 6), false); assert.equal(inWindow(5, 5, 5), false);
  const d = decide(base(at(23, 30)));
  assert.equal(d.scene, "night"); assert.ok(d.dim > 0.5);
  const m = decide(base(at(23, 30), { music: { playing: true, track: "x", at: at(23, 30) } }));
  assert.equal(m.scene, "music"); assert.ok(m.dim > 0 && m.dim < 0.7);
  assert.equal(decide(base(at(5, 59))).scene, "night");
  assert.equal(decide(base(at(6, 0))).scene, "morning");
});
test("morning window", () => {
  assert.equal(decide(base(at(7, 30))).scene, "morning");
  assert.equal(decide(base(at(9, 0))).scene, "idle");
  assert.equal(decide(base(at(7, 30), { config: { morningStart: 8, morningEnd: 10 } })).scene, "idle");
});

test("a quiet Permuta never takes the page over: it keeps working and says so", () => {
  const now = at(13);
  assert.equal(decide(base(now, { statusAt: Math.floor(now / 1000) - 200 })).scene, "idle");
  assert.ok(decide(base(now, { statusAt: Math.floor(now / 1000) - 200 })).stale);
  assert.ok(decide(base(now, { apiOk: false })).stale);
  assert.equal(decide(base(now, { statusAt: Math.floor(now / 1000) - 30 })).stale, undefined);
});

test("a stale music state is not believed", () => {
  const now = at(13);
  assert.equal(decide(base(now, { statusAt: Math.floor(now / 1000) - 600, music: { playing: true, track: "x", at: now } })).scene, "idle");
});

test("config: order, disabled, bad values and unknown fields", () => {
  const now = at(9, 30), m = { playing: true, track: "x", at: now };
  assert.equal(decide(base(now, { music: m, events: [ev(now, 5)], config: { order: ["music", "soon", "idle"] } })).scene, "music");
  assert.equal(decide(base(now, { music: m, config: { disabled: ["music"] } })).scene, "idle");
  assert.equal(decide(base(now, { config: { disabled: ["idle"] } })).scene, "idle");                       // idle is the fallback and can't be disabled
  const odd = resolveConfig({ soonLeadMin: "x" as unknown as number, order: ["bogus", "music"] as never, whatever: 1 } as never);
  assert.equal(odd.soonLeadMin, DEFAULTS.soonLeadMin); assert.deepEqual(odd.order, ["music"]);
  assert.equal(decide(base(now, { music: m, config: { order: ["music"] } })).scene, "music");
});
test("applies lists everything that applies, highest priority first", () => {
  const now = at(23, 30);
  const d = decide(base(now, { music: { playing: true, track: "x", at: now }, away: true }));
  assert.deepEqual(d.applies.slice(0, 4), ["away", "music", "night", "idle"]);
});

test("settle: dwell time, urgent scenes, and scenes that stop applying", () => {
  const now = at(13);
  const idle = decide(base(now)), music = decide(base(now, { music: { playing: true, track: "x", at: now } }));
  let st = settle(null, idle, now, 20);
  assert.equal(st.scene, "idle");
  st = settle(st, music, now + 5000, 20);                           // too soon to change
  assert.equal(st.scene, "idle");
  st = settle(st, music, now + 21000, 20);
  assert.equal(st.scene, "music");
  const soon = decide(base(now, { events: [ev(now, 5)] }));
  assert.equal(settle({ scene: "idle", since: now }, soon, now + 1000, 20).scene, "soon");        // urgent
  const stopped = decide(base(now, { music: { playing: false, track: "x", at: now - 10 * 60000 } }));
  assert.equal(settle({ scene: "music", since: now }, stopped, now + 1000, 20).scene, "idle");    // music no longer applies
  assert.equal(settle({ scene: "idle", since: now }, idle, now + 1000, 20).since, now);           // same scene: unchanged
});

test("day: a busy day (enough events left, or school/church) shows the timeline, below music and soon, above morning", () => {
  const now = at(12);
  const three = [ev(now, 60), ev(now, 120), ev(now, 180)];
  assert.equal(decide(base(now, { events: three })).scene, "day");
  assert.equal(decide(base(now, { events: [ev(now, 60), ev(now, 120)] })).scene, "idle");
  assert.equal(decide(base(now, { events: [ev(now, 90, { kind: "school" })] })).scene, "day");
  assert.equal(decide(base(now, { events: [ev(now, 90, { kind: "church", allDay: true })] })).scene, "idle");     // all-day events don't make a busy day
  assert.equal(decide(base(now, { events: three, music: { playing: true, track: "x", at: now } })).scene, "music");
  assert.equal(decide(base(now, { events: [ev(now, 10), ...three] })).scene, "soon");
  assert.equal(decide(base(at(7, 30), { events: [ev(at(7, 30), 90, { kind: "school" })] })).scene, "day");           // beats the morning summary
  assert.equal(decide(base(now, { events: three, config: { dayMinEvents: 5 } })).scene, "idle");
  assert.equal(decide(base(now, { events: three, config: { disabled: ["day"] } })).scene, "idle");
  assert.equal(decide(base(at(23, 50), { events: [ev(at(23, 50), 5, { tier: 0 })] })).scene, "night");
});

test("music lights on: the Music scene takes priority even with nothing playing", () => {
  const n = at(15);
  assert.notEqual(decide(base(n)).scene, "music");
  assert.equal(decide(base(n, { musicLights: true })).scene, "music");
});
