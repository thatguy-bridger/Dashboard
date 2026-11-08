import test from "node:test";
import assert from "node:assert/strict";
import { predictMusic, positionOf, blendPosition, pickLyrics, liveEvents, setOpt, failOpt, resolveOpt, overridesFor, applyHome, applyMusic, reportedFor, OPT_TTL_MS } from "./predict.ts";
import type { Music } from "./types.ts";
import type { Home } from "./ha.ts";

const T0 = 1_000_000;
const song = (over: Partial<Music> = {}): Music => ({ trackId: "a", playing: true, track: "Song A", artist: "Artist", duration: 200, progress: 190, at: T0, volume: 0.4, device: "Den", palette: ["#ff0000"], ...over });
const next = { id: "b", track: "Song B", artist: "Other", art: "b.jpg", duration: 180, palette: ["#00ff00"], lyricsId: "b" };

test("position keeps time with the clock while playing, and stands still when paused", () => {
  assert.equal(positionOf(song(), T0 + 4000), 194); assert.equal(positionOf(song({ playing: false }), T0 + 4000), 190); assert.equal(positionOf(song(), T0 - 500), 190);
});
test("before the end nothing changes (the very same object comes back)", () => { const m = song({ next }); assert.equal(predictMusic(m, T0 + 5000), m); });

test("rollover with a known next song: it starts at 0 from the predicted end moment, with its art, palette and lyrics id", () => {
  const m = song({ next }), end = T0 + 10_000;
  const p = predictMusic(m, end + 2500)!;
  assert.equal(p.predicted, true); assert.equal(p.trackId, "b"); assert.equal(p.track, "Song B"); assert.equal(p.art, "b.jpg"); assert.deepEqual(p.palette, ["#00ff00"]); assert.equal(p.lyricsId, "b");
  assert.equal(p.duration, 180); assert.equal(p.playing, true); assert.equal(p.volume, 0.4); assert.equal(p.device, "Den");
  assert.equal(positionOf(p, end + 2500), 2.5);                                      // counted from the end moment, not from "now"
  assert.equal(predictMusic(m, end - 1)!.track, "Song A");                           // a hair before: still the old one
  assert.equal(predictMusic(m, end)!.track, "Song B");
});
test("rollover without a next song: hold at the end, paused look, never 3:37 / 3:37 for ever", () => {
  const p = predictMusic(song(), T0 + 60_000)!;
  assert.equal(p.ended, true); assert.equal(p.playing, false); assert.equal(p.progress, 200); assert.equal(positionOf(p, T0 + 120_000), 200); assert.equal(p.track, "Song A");
});
test("the next song can end too (nothing beyond it is known): hold at its end", () => {
  const p = predictMusic(song({ next }), T0 + 10_000 + 181_000)!;
  assert.equal(p.track, "Song B"); assert.equal(p.ended, true); assert.equal(p.playing, false); assert.equal(p.progress, 180);
});
test("paused music and unknown lengths are never rolled over", () => {
  assert.equal(predictMusic(song({ playing: false, next }), T0 + 999_999)!.track, "Song A");
  assert.equal(predictMusic(song({ duration: 0, next }), T0 + 999_999)!.track, "Song A");
  assert.equal(predictMusic(null, 5), null);
  assert.equal(predictMusic(song({ next: { track: "No length" } }), T0 + 20_000)!.ended, true);                // a next song without a length can't be predicted
});

test("reconcile: a report for the same song keeps going with a gentle correction, never a jump", () => {
  // the page predicted song B and shows 12.0 s in; the server reports B at 11.2 s: 0.8 s off
  let shown = 12.0; const trail: number[] = [];
  for (let i = 0; i < 4; i++) { const before = shown; shown = blendPosition(shown, 12.0 + i + 1 - 0.8, 1); trail.push(shown - before); }
  assert.ok(Math.abs(shown - 15.2) < 1e-9, String(shown));                             // converged on the server's position
  assert.ok(trail.every((d) => d > 0.7 && d <= 1.0), String(trail));                   // never jumped or went backwards: each second moved between 0.75 and 1.0 s
  const step = blendPosition(10, 10.9 + 1, 1);                                          // target 1.0 s ahead of where we will be: corrected by only 0.25
  assert.ok(Math.abs(step - 11.25) < 1e-9);
  assert.equal(blendPosition(10, 30, 1), 30);                                           // a big difference is a seek: jump
  assert.equal(blendPosition(10, 11, 1), 11);                                           // already exact: just keeps time
});
test("reconcile: a report for a different song wins at once", () => {
  const predicted = predictMusic(song({ next }), T0 + 15_000)!;                         // we think song B
  const report = song({ trackId: "c", track: "Song C", progress: 3, at: T0 + 14_000 }); // the server says the user skipped to C
  assert.equal(predicted.trackId, "b");
  assert.equal(predictMusic(report, T0 + 15_000)!.trackId, "c");                        // prediction always starts from the latest report
});
test("lyrics follow the song being shown", () => {
  const cur = { id: "a", lines: [[1, "a"]] }, nxt = { id: "b", lines: [[1, "b"]] };
  assert.equal(pickLyrics("a", cur, nxt), cur); assert.equal(pickLyrics("b", cur, nxt), nxt); assert.equal(pickLyrics("z", cur, nxt), null); assert.equal(pickLyrics(undefined, cur, nxt), null); assert.equal(pickLyrics("b", null, null), null);
});

test("events whose end has passed drop out on their own, and the list stays sorted", () => {
  const now = 10_000_000, e = (title: string, s: number, en: number) => ({ title, start: s, end: en });
  const evs = [e("late", 10_500, 11_000), e("over", 9_000, 9_900), e("running", 9_990, 10_020), e("edge", 9_000, 10_000)];
  assert.deepEqual(liveEvents(evs, now).map((x) => x.title), ["running", "late"]);
  assert.deepEqual(liveEvents(evs, now + 25_000).map((x) => x.title), ["late"]);
});

const home = (): Home => ({ configured: true, reachable: true, away: false, musicLights: false, rooms: ["Den"], devices: [
  { id: "light.a", name: "Lamp", kind: "light", room: "Den", on: false, dimmable: true, brightness: 0.2 }, { id: "light.b", name: "LED strip", kind: "light", room: "Den", on: true, dimmable: false },
  { id: "light.c", name: "Ceiling", kind: "light", room: "Den", on: true, dimmable: true, brightness: 0.9 },
  { id: "fan.f", name: "Fan", kind: "fan", room: "Den", on: false, dimmable: false, percentage: 0, speedCount: 3 }, { id: "media_player.s", name: "Speaker", kind: "media", room: "Speakers", on: true, dimmable: false, playing: true, volume: 0.3 } ] as Home["devices"] });

test("controls apply at once: lights, brightness, fans, speakers, scenes, music lights, Permuta's music keys", () => {
  let m = setOpt({}, overridesFor({ op: "toggle", id: "light.a", on: true }), 100);
  let h = applyHome(home(), m)!;
  assert.equal(h.devices[0].on, true);
  m = setOpt(m, overridesFor({ op: "brightness", ids: ["light.a", "light.c"], pct: 55 }), 110); h = applyHome(home(), m)!;
  assert.equal(h.devices[0].brightness, 0.55); assert.equal(h.devices[2].brightness, 0.55); assert.equal(h.devices[0].on, true);
  m = setOpt(m, overridesFor({ op: "fan", id: "fan.f", pct: 66 }), 120); h = applyHome(home(), m)!;
  assert.equal(h.devices[3].percentage, 0.66); assert.equal(h.devices[3].on, true);
  m = setOpt(m, overridesFor({ op: "media", id: "media_player.s", action: "pause" }), 130); m = setOpt(m, overridesFor({ op: "volume", id: "media_player.s", level: 0.7 }), 131); h = applyHome(home(), m)!;
  assert.equal(h.devices[4].playing, false); assert.equal(h.devices[4].volume, 0.7);
  m = setOpt(m, overridesFor({ op: "musicLights", on: true }), 140); assert.equal(applyHome(home(), m)!.musicLights, true);
  const night = overridesFor({ op: "scene", name: "night" }, home()); assert.deepEqual(Object.keys(night).sort(), ["dev:light.a:on", "dev:light.c:on"]);   // the LED strip stays on
  assert.equal(overridesFor({ op: "scene", name: "leaving" }, home()).away, true); assert.equal(overridesFor({ op: "scene", name: "returning" }).away, false);
  const mu = setOpt({}, overridesFor({ op: "permuta", cmd: { type: "music", action: "pause" } }), 1); assert.equal(applyMusic({ playing: true, volume: 0.4 }, mu)!.playing, false);
  assert.equal(applyMusic({ playing: true, volume: 0.4 }, setOpt({}, overridesFor({ op: "permuta", cmd: { type: "music", action: "volume", level: 0.9 } }), 1))!.volume, 0.9);
  assert.deepEqual(overridesFor({ op: "permuta", cmd: { type: "music", action: "next" } }), {});                           // can't be predicted
  assert.equal(applyHome(null, m), null); assert.equal(applyHome(home(), {})!.devices[0].on, false);
});
test("an override is confirmed by a matching report, reverted by a failure, and expires if the reports keep disagreeing", () => {
  const m = setOpt({}, { "dev:light.a:on": true, "dev:light.c:brightness": 0.55 }, 1000);
  const h = home();
  // reports disagree, inside the grace period: still overridden
  assert.deepEqual(Object.keys(resolveOpt(m, reportedFor(m, h, null), 1000 + OPT_TTL_MS - 1)).sort(), ["dev:light.a:on", "dev:light.c:brightness"]);
  // …and after it: dropped, the report wins (the revert)
  assert.deepEqual(resolveOpt(m, reportedFor(m, h, null), 1000 + OPT_TTL_MS), {});
  // a report that matches confirms it early
  const h2 = home(); h2.devices[0].on = true; h2.devices[2].brightness = 0.56;
  assert.deepEqual(resolveOpt(m, reportedFor(m, h2, null), 1500), {});
  // a request that fails reverts immediately
  assert.deepEqual(failOpt(m, ["dev:light.a:on"]), { "dev:light.c:brightness": m["dev:light.c:brightness"] });
  // unchanged map is returned as is (no needless re-render)
  assert.equal(resolveOpt(m, {}, 1100), m);
});
test("music overrides confirm against the music report", () => {
  const m = setOpt({}, { "music.playing": false }, 1000);
  assert.deepEqual(resolveOpt(m, reportedFor(m, null, { playing: true }), 2000), m);
  assert.deepEqual(resolveOpt(m, reportedFor(m, null, { playing: false }), 2000), {});
});
