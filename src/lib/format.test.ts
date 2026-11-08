import test from "node:test";
import assert from "node:assert/strict";
import { fmtClock, fmtTime, hourLabel, setHours24, getHours24, until, when, countdown, mmss, dayLabel } from "./format.ts";
import { reloadDue, resolvePulse } from "./pulse.ts";
import { resolveTheme, cssVars, soften, titleGradient, luminance, mix } from "./theme.ts";

const t = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

test("clock formats", () => {
  assert.deepEqual(fmtClock(t(7, 0, 5)), { time: "12:05", ampm: "AM" });
  assert.deepEqual(fmtClock(t(7, 21, 59)), { time: "9:59", ampm: "PM" });
  assert.deepEqual(fmtClock(t(7, 9, 3), true), { time: "09:03", ampm: "" });
});
test("until / countdown / mmss", () => {
  const now = t(7, 10);
  assert.equal(until(now / 1000 + 12 * 60, now), "in 12 min");
  assert.equal(until(now / 1000 + 121 * 60, now), "in 2h 1m");
  assert.equal(until(now / 1000 - 5, now), "now");
  assert.equal(countdown(725), "12:05"); assert.equal(countdown(3725), "1:02:05"); assert.equal(countdown(-3), "0:00");
  assert.equal(mmss(217), "3:37");
});
test("when labels", () => {
  const now = t(7, 22);
  assert.equal(dayLabel(t(7, 23), now), "Today"); assert.equal(dayLabel(t(8, 8), now), "Tomorrow");
  assert.equal(when({ start: t(8, 8, 30) / 1000, end: t(8, 11, 30) / 1000 }, now), "Tomorrow 8:30 AM – 11:30 AM");
  assert.equal(when({ start: t(8, 0) / 1000, end: t(9, 0) / 1000, allDay: true }, now), "Tomorrow · all day");
});
test("reload only when due and calm", () => {
  const base = { now: 100 * 60000, loadedAt: 0, scene: "idle", newVersion: false, reloadMin: 60, interacting: false };
  assert.equal(reloadDue(base), true);
  assert.equal(reloadDue({ ...base, loadedAt: 70 * 60000 }), false);
  assert.equal(reloadDue({ ...base, scene: "soon" }), false);
  assert.equal(reloadDue({ ...base, scene: "soon", now: 130 * 60000 }), true);          // very old: don't wait for ever
  assert.equal(reloadDue({ ...base, interacting: true }), false);
  assert.equal(reloadDue({ ...base, loadedAt: 99 * 60000, newVersion: true }), true);   // a new deployment
  assert.equal(reloadDue({ ...base, loadedAt: 99 * 60000, newVersion: true, scene: "soon" }), false);
  assert.deepEqual(resolvePulse({ pulseMin: -3, reloadMin: "x" as never }), { pulseMin: 1, reloadMin: 60, versionMin: 5 });
});
test("theme: defaults, validation, light mode", () => {
  assert.equal(resolveTheme(null).accent, "#7c8cff");
  assert.equal(resolveTheme({ accent: "nope" } as never, "#112233").accent, "#112233");
  assert.equal(resolveTheme({ radius: 99 }).radius, 1.6); assert.equal(resolveTheme({ font: "comic" as never }).font, "rounded");
  assert.equal(cssVars(resolveTheme({ accent: "#ff0000" }), "#00ff00")["--accent"], soften("#00ff00"));
  assert.equal(cssVars(resolveTheme({ accent: "#ff0000", artAccent: false }), "#00ff00")["--accent"], soften("#ff0000"));
  assert.equal(cssVars(resolveTheme({ dark: false }))["--bg"], "#f4f1ec");
  assert.equal(cssVars(resolveTheme({}))["--fg"], "#ece9e4");                       // off-white, never pure white
  assert.notEqual(soften("#ff0000"), "#ff0000"); assert.equal(soften("#ffffff"), "#ffffff"); assert.equal(soften("#000000").length, 7);
  const hs = (h: string) => { const n = parseInt(h.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b, 1); };
  assert.ok(hs(soften("#ff0000")) < hs("#ff0000"));                                   // less saturated than the original
});

test("12-hour and 24-hour edge cases", () => {
  const c = (h: number, m: number) => t(7, h, m);
  assert.equal(fmtTime(c(0, 0), false), "12:00 AM"); assert.equal(fmtTime(c(0, 5), false), "12:05 AM");
  assert.equal(fmtTime(c(12, 0), false), "12:00 PM"); assert.equal(fmtTime(c(12, 5), false), "12:05 PM");
  assert.equal(fmtTime(c(13, 7), false), "1:07 PM"); assert.equal(fmtTime(c(23, 59), false), "11:59 PM"); assert.equal(fmtTime(c(9, 3), false), "9:03 AM");
  assert.equal(fmtTime(c(0, 0), true), "00:00"); assert.equal(fmtTime(c(0, 5), true), "00:05"); assert.equal(fmtTime(c(12, 5), true), "12:05"); assert.equal(fmtTime(c(23, 59), true), "23:59"); assert.equal(fmtTime(c(9, 3), true), "09:03");
  assert.deepEqual(fmtClock(c(0, 0), false), { time: "12:00", ampm: "AM" }); assert.deepEqual(fmtClock(c(12, 5), false), { time: "12:05", ampm: "PM" });
  assert.deepEqual(fmtClock(c(0, 0), true), { time: "00:00", ampm: "" });
  assert.equal(hourLabel(0, false), "12a"); assert.equal(hourLabel(12, false), "12p"); assert.equal(hourLabel(15, false), "3p"); assert.equal(hourLabel(9, true), "09"); assert.equal(hourLabel(15, true), "15");
});
test("the page-wide setting drives every time, and defaults to 12-hour", () => {
  assert.equal(getHours24(), false);
  const ev = { start: t(8, 8, 30) / 1000, end: t(8, 13, 30) / 1000 }; const now = t(7, 22);
  assert.equal(when(ev, now), "Tomorrow 8:30 AM – 1:30 PM");
  setHours24(true);
  assert.equal(fmtTime(t(7, 14, 5)), "14:05"); assert.equal(when(ev, now), "Tomorrow 08:30 – 13:30"); assert.deepEqual(fmtClock(t(7, 14, 5)), { time: "14:05", ampm: "" });
  setHours24(undefined); assert.equal(getHours24(), false); assert.equal(fmtTime(t(7, 14, 5)), "2:05 PM");
});

test("title gradient: from the palette, readable, 2 to 4 stops, fallback when empty", () => {
  const stops = (g: string) => g.match(/#[0-9a-f]{6}/g) ?? [];
  const g = titleGradient(["#ff0000", "#0000ff", "#00aa00"], "#7c8cff");
  assert.ok(g.startsWith("linear-gradient(100deg")); assert.equal(stops(g).length, 3);
  for (const c of stops(g)) assert.ok(luminance(c) >= 0.38, `${c} is too dark to read on the dark backdrop`);
  assert.equal(stops(titleGradient(["#112233"], "#7c8cff")).length, 2);                         // one colour becomes a gentle two-stop gradient
  assert.equal(stops(titleGradient(["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff"], "#7c8cff")).length, 4);   // at most four
  assert.equal(stops(titleGradient(["red", "#12"], "#7c8cff")).length, 2);                      // invalid colours are ignored: the fallback is used
  assert.equal(stops(titleGradient(undefined, "#7c8cff")).length, 2); assert.equal(titleGradient([], "#7c8cff", 120).startsWith("linear-gradient(120deg"), true);
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080"); assert.ok(luminance("#ffffff") > 0.99 && luminance("#000000") < 0.01);
});
