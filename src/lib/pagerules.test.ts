import test from "node:test";
import assert from "node:assert/strict";
import { allowedPages, pageAllowed } from "./pagerules.ts";

test("page rules", () => {
  assert.equal(pageAllowed(undefined, "weather", 3), true);
  assert.equal(pageAllowed({ weather: [0, 0, 24] }, "weather", 3), false);
  assert.equal(pageAllowed({ weather: [1, 6, 9] }, "weather", 7), true);
  assert.equal(pageAllowed({ weather: [1, 6, 9] }, "weather", 9), false);
  assert.equal(pageAllowed({ mail: [1, 22, 6] }, "mail", 23), true);
  assert.equal(pageAllowed({ mail: [1, 22, 6] }, "mail", 12), false);
  assert.deepEqual(allowedPages(["standby", "weather"], { weather: [0, 0, 24], standby: [0, 0, 24] }, 5), ["standby"]);
});
