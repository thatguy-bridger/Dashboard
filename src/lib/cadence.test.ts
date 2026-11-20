import test from "node:test";
import assert from "node:assert/strict";
import { isNight, screenEvery, homeEvery, pingEvery } from "./cadence.ts";
import { memo, forget } from "./memo.ts";

test("night is 11 pm to 6 am", () => {
  assert.equal(isNight(new Date(2026, 10, 20, 23, 0)), true);
  assert.equal(isNight(new Date(2026, 10, 20, 2, 30)), true);
  assert.equal(isNight(new Date(2026, 10, 20, 6, 0)), false);
  assert.equal(isNight(new Date(2026, 10, 20, 14, 0)), false);
});

test("requests are never faster than every 5 seconds, and slower when idle", () => {
  for (const f of [() => screenEvery(true), () => screenEvery(false), () => homeEvery(true), () => homeEvery(false), () => pingEvery()]) assert.ok(f() >= 5000);
  assert.ok(homeEvery(false) >= homeEvery(true));
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
