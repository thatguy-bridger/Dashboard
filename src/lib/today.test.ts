import test from "node:test";
import assert from "node:assert/strict";
import { todayCards } from "./today.ts";
import type { SourceCtx } from "./sources/types.ts";

const base = (over: Partial<SourceCtx> = {}): SourceCtx => ({ now: new Date("2026-11-09T10:00:00").getTime(), scene: "idle", events: [], music: null, weather: { current: { temperature_2m: 50, weather_code: 0 } }, away: false, extra: {}, soonLeadMin: 15, ...over });
const ev = (title: string, startMin: number, now: number) => ({ title, start: now / 1000 + startMin * 60, end: now / 1000 + (startMin + 50) * 60, allDay: false, color: "#fff" }) as never;

test("today page ranks by what matters now", () => {
  const c = base();
  assert.equal(todayCards(c)[0].id, "weather");                                        // nothing else going on
  const withMusic = base({ music: { playing: true, track: "X", artist: "Y", progress: 5, duration: 200, at: c.now } });
  assert.equal(todayCards(withMusic)[0].id, "music");                                   // playing music leads
  const soon = base({ events: [ev("Chem", 20, c.now)], music: withMusic.music });
  assert.equal(todayCards(soon)[0].id, "music");
  assert.equal(todayCards(soon).find((x) => x.id === "next")!.score, 88);
  assert.equal(todayCards(base({ events: [ev("Chem", 20, c.now)] }))[0].id, "next");   // an event in 20 min beats plain weather
  assert.equal(todayCards(base(), { rainSoon: true })[0].score, 78);
  assert.ok(todayCards(withMusic, {}, 1).length === 1);
});
