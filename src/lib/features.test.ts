import test from "node:test";
import assert from "node:assert/strict";
import { cancelCall, cancelPlan, liveTimers, startTimers, timerCalls, timerOf, TIMER_SCRIPT } from "./timer.ts";
import { awayEdge, greetingFor, welcomeInfo, welcomeGreeting } from "./welcome.ts";
import { batteryExtra, fromManager } from "./battery.ts";
import { battery, parseBattery } from "./sources/battery.ts";
import { exemptFrom, fanRequest, GUEST_EXIT_MS, guestActive, guestAllows, guestPlan, lightsRequest, triggerOutcome } from "./guest.ts";
import { resolveDevice, sanitizeInfo } from "./device.ts";
import type { SourceCtx } from "./sources/types.ts";

// ----- timers -----
test("timer request: one script call per entity with entity, minutes and on", () => {
  const c = timerCalls({ id: "light.desk", minutes: 30 });
  assert.deepEqual(c, [{ domain: "script", service: "turn_on", data: { entity_id: TIMER_SCRIPT, variables: { entity: "light.desk", minutes: 30, on: false } } }]);
  assert.equal(timerCalls({ id: "fan.bed", minutes: 15, on: true })[0].data.variables && (timerCalls({ id: "fan.bed", minutes: 15, on: true })[0].data.variables as { on: boolean }).on, true);
  assert.equal(timerCalls({ ids: ["light.a", "light.b", "light.a"], minutes: 60 }).length, 2);       // a room: every light, no duplicates
});
test("timer request: bad minutes or entity ids make no call at all", () => {
  for (const m of [0, -5, 721, NaN, "30", undefined, null]) assert.deepEqual(timerCalls({ id: "light.a", minutes: m }), []);
  assert.deepEqual(timerCalls({ id: "lock.front_door", minutes: 10 }), []);               // only lights, fans and switches
  assert.deepEqual(timerCalls({ id: "light.a; rm", minutes: 10 }), []);
  assert.deepEqual(timerCalls({ minutes: 10 }), []);
  assert.equal(timerCalls({ id: "light.a", minutes: 29.6 })[0].data.variables && (timerCalls({ id: "light.a", minutes: 29.6 })[0].data.variables as { minutes: number }).minutes, 30);
});
test("cancel call turns the script off", () => assert.deepEqual(cancelCall(), { domain: "script", service: "turn_off", data: { entity_id: "script.permuta_timer" } }));
test("local timers: start, read, expire", () => {
  const t0 = startTimers({}, ["light.a", "light.b"], 30, false, 1000);
  assert.equal(t0["light.a"].at, 1000 + 30 * 60000);
  assert.deepEqual(timerOf(t0, ["light.c"], 2000), null);
  assert.equal(timerOf(t0, ["light.a", "light.b"], 2000)?.at, 1000 + 1800000);
  assert.deepEqual(liveTimers(t0, 1000 + 1800000), {});          // it has fired
  const t1 = startTimers(t0, ["light.a"], 15, true, 5000);       // a new timer replaces the old one for that light
  assert.deepEqual(t1["light.a"], { at: 5000 + 900000, on: true });
});
test("cancelling one light re-arms the others with what is left", () => {
  let t = startTimers({}, ["light.a"], 15, false, 0); t = startTimers(t, ["fan.b"], 60, false, 0);
  const p = cancelPlan(t, ["light.a"], 10 * 60000 + 1);
  assert.deepEqual(Object.keys(p.timers), ["fan.b"]);
  assert.deepEqual(p.rearm, [{ id: "fan.b", minutes: 50, on: false }]);       // 49 min 59.9 s left, rounded up
  assert.deepEqual(cancelPlan(t, ["light.a", "fan.b"], 0).rearm, []);
});

// ----- welcome back -----
test("away edge: back, left, and never on the first reading", () => {
  assert.equal(awayEdge(null, true), null); assert.equal(awayEdge(null, false), null);
  assert.equal(awayEdge(true, false), "back"); assert.equal(awayEdge(false, true), "left");
  assert.equal(awayEdge(true, true), null); assert.equal(awayEdge(false, false), null);
});
test("greetings follow the time of day", () => {
  assert.equal(greetingFor(8), "Good morning"); assert.equal(greetingFor(14), "Good afternoon"); assert.equal(greetingFor(20), "Good evening"); assert.equal(greetingFor(2), "Still up?");
  assert.equal(welcomeGreeting(8), "Good morning. Welcome back"); assert.equal(welcomeGreeting(3), "Welcome back");
});
test("welcome info: weather, next event, unread", () => {
  const now = Date.UTC(2026, 10, 8, 15, 0), sec = now / 1000;
  const i = welcomeInfo({ now, events: [{ title: "Old", start: sec - 7200, end: sec - 3600 } as never, { title: "Chemistry", start: sec + 1800, end: sec + 5400 } as never], weather: { current: { temperature_2m: 43.6, weather_code: 3, is_day: 1 } }, unread: 3 });
  assert.deepEqual(i.weather, { temp: 44, icon: "cloud" }); assert.equal(i.next?.title, "Chemistry"); assert.equal(i.next?.startsIn, 30); assert.equal(i.unread, 3);
  const e = welcomeInfo({ now, events: [], weather: null, unread: -2 }); assert.equal(e.weather, null); assert.equal(e.next, null); assert.equal(e.unread, 0);
});

// ----- tablet battery -----
const ctx = (extra: Record<string, unknown>): SourceCtx => ({ now: 0, scene: "idle", events: [], music: null, weather: null, away: false, extra, soonLeadMin: 15 });
test("battery from the browser API: percent, charging, nothing without it", () => {
  assert.deepEqual(fromManager({ level: 0.14, charging: false }), { pct: 14, charging: false });
  assert.deepEqual(fromManager({ level: 1.4, charging: true }), { pct: 100, charging: true });
  assert.equal(fromManager(null), null); assert.equal(fromManager({}), null); assert.equal(fromManager({ level: "x" }), null);
});
test("battery: the page's own reading beats Permuta's; without either there is nothing", () => {
  assert.deepEqual(batteryExtra({ pct: 14, charging: false }, { battery: { pct: 90 }, mail: 1 }), { battery: { pct: 14, charging: false }, mail: 1 });
  assert.deepEqual(batteryExtra(null, { battery: { pct: 90 } }), { battery: { pct: 90 } }); assert.deepEqual(batteryExtra(null, undefined), {});
});
test("battery source: a pill at 20% or less and not charging, nothing otherwise", () => {
  const low = battery.items(ctx(batteryExtra({ pct: 14, charging: false }, {})));
  assert.equal(low.length, 1); assert.equal(low[0].title, "Tablet battery 14%"); assert.equal(battery.score(ctx(batteryExtra({ pct: 14, charging: false }, {}))), 55);
  assert.equal(battery.items(ctx(batteryExtra({ pct: 20, charging: false }, {}))).length, 1);
  assert.equal(battery.items(ctx(batteryExtra({ pct: 21, charging: false }, {}))).length, 0);
  assert.equal(battery.items(ctx(batteryExtra({ pct: 5, charging: true }, {}))).length, 0);
  assert.equal(battery.items(ctx({})).length, 0); assert.equal(parseBattery(undefined), null);
});
test("the device ping carries the battery, sanitised", () => {
  assert.deepEqual(sanitizeInfo({ battery: { pct: 14.4, charging: true } }).battery, { pct: 14, charging: true });
  assert.deepEqual(sanitizeInfo({ battery: { pct: 400 } }).battery, { pct: 100, charging: false });
  assert.equal(sanitizeInfo({ battery: "x" }).battery, undefined); assert.equal(sanitizeInfo({}).battery, undefined);
});

// ----- guest mode -----
test("guest flag is part of the device config", () => {
  assert.equal(resolveDevice({}).guest, false); assert.equal(resolveDevice({ guest: true }).guest, true); assert.equal(resolveDevice({ guest: "yes" }).guest, false);
});
test("guest is active until the PIN exemption, which lasts four hours", () => {
  const t = 1e12;
  assert.equal(guestActive({ guest: false }, 0, t), false); assert.equal(guestActive({ guest: true }, 0, t), true);
  const until = exemptFrom(t); assert.equal(until - t, GUEST_EXIT_MS); assert.equal(GUEST_EXIT_MS, 4 * 3600 * 1000);
  assert.equal(guestActive({ guest: true }, until, t + 1000), false);            // exempt
  assert.equal(guestActive({ guest: true }, until, until), true);                // the four hours are up
});
test("guest gating: only lights, fan and PIN are reachable", () => {
  for (const a of ["lights", "fan", "pin"] as const) assert.equal(guestAllows(true, a), true);
  for (const a of ["settings", "navigate", "island", "welcome", "scene"] as const) { assert.equal(guestAllows(true, a), false); assert.equal(guestAllows(false, a), true); }
});
test("guest: the hidden trigger asks for the PIN and never opens settings directly", () => {
  assert.equal(triggerOutcome(true, false), "pin-exit"); assert.equal(triggerOutcome(true, true), "pin-exit");
  assert.equal(triggerOutcome(false, false), "settings"); assert.equal(triggerOutcome(false, true), "pin-settings");
});
test("guest plan: one lights switch for every light, each fan with its step", () => {
  const p = guestPlan([{ id: "light.a", kind: "light", name: "A", on: false }, { id: "switch.lamp", kind: "plug", name: "Lamp", on: true }, { id: "fan.bed", kind: "fan", name: "Bedroom fan", on: true, percentage: 0.66, speedCount: 3 }, { id: "media_player.x", kind: "media", name: "S", on: true }]);
  assert.deepEqual(p.lightIds, ["light.a", "switch.lamp"]); assert.equal(p.lightsOn, true);
  assert.deepEqual(p.fans, [{ id: "fan.bed", name: "Bedroom fan", steps: 3, step: 2 }]);
  assert.deepEqual(lightsRequest(p), { op: "many", ids: ["light.a", "switch.lamp"], on: false });
  assert.deepEqual(lightsRequest({ ...p, lightsOn: false }).on, true);
  assert.deepEqual(fanRequest(p.fans[0], 3), { op: "fan", id: "fan.bed", pct: 100 }); assert.deepEqual(fanRequest(p.fans[0], 0), { op: "fan", id: "fan.bed", pct: 0 });
  assert.equal(guestPlan([{ id: "fan.x", kind: "fan", name: "x", on: false, speedCount: 3 }]).fans[0].step, 0);
});
