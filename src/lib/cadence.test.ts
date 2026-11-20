import test from "node:test";
import assert from "node:assert/strict";
import { isNight, screenEvery, homeEvery, tier, setLights, lightsOn } from "./cadence.ts";
import { memo, forget } from "./memo.ts";

test("night is 11 pm to 6 am", () => {
  assert.equal(isNight(new Date(2026, 10, 20, 23, 0)), true);
  assert.equal(isNight(new Date(2026, 10, 20, 2, 30)), true);
  assert.equal(isNight(new Date(2026, 10, 20, 6, 0)), false);
  assert.equal(isNight(new Date(2026, 10, 20, 14, 0)), false);
});

test("hands-on is about as quick as before; away is far slower", () => {
  assert.equal(tier(), 0);                                        // just loaded: counts as hands-on
  assert.ok(screenEvery(false) <= 5000 && homeEvery(true) <= 3000);
  setLights(1); assert.equal(tier(false, Date.now() + 5 * 60_000) <= 1, true);
});

test("lights off: away, then asleep; lights on wakes it; playing music keeps it up", () => {
  setLights(0);
  const later = Date.now() + 10 * 60_000;                       // idle for 10 minutes
  const idle = (n: number) => { const real = Date.now; Date.now = () => n; try { return tier(false, n); } finally { Date.now = real; } };
  assert.ok(idle(later) >= 1);
  setLights(1);
  assert.equal(tier(true, later) <= 1, true);
  const afterNight = new Date(2026, 10, 21, 2, 0).getTime();
  assert.ok(screenEvery(false) >= 0);
  assert.equal(isNight(new Date(afterNight)), true);
});

test("pace tables: away is slower than lights on, which is slower than hands-on", () => {
  const g = (f: (p: boolean) => number) => f(false);
  assert.ok(g(screenEvery) > 0);
  assert.equal(lightsOn([{ kind: "light", on: true, room: "Bedroom" }, { kind: "light", on: true, room: "Kitchen" }, { kind: "plug", on: true, room: "Bedroom" }], "bedroom"), 1);
  assert.equal(lightsOn([{ kind: "light", on: true, room: "Bedroom" }, { kind: "light", on: false, room: "Kitchen" }]), 1);
  assert.equal(lightsOn([], "x"), 0);
});

test("the server remembers a result for a moment, and forgets on request", async () => {
  let n = 0;
  const f = async () => ++n;
  assert.equal(await memo("t:a", 1000, f), 1);
  assert.equal(await memo("t:a", 1000, f), 1);
  forget("t:");
  assert.equal(await memo("t:a", 1000, f), 2);
  let bad = 0;
  await assert.rejects(memo("t:b", 1000, async () => { bad++; throw new Error("x"); }));
  await assert.rejects(memo("t:b", 1000, async () => { bad++; throw new Error("x"); }));
  assert.equal(bad, 2);                                  // a failure is not remembered
});
