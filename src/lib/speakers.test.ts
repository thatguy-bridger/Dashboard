import test from "node:test";
import assert from "node:assert/strict";
import { pickOutput, visibleSpeaker } from "./speakers.ts";

test("no list shows everything; a list shows only those, ignoring case and punctuation", () => {
  assert.equal(visibleSpeaker("Bedroom", undefined), true);
  assert.equal(visibleSpeaker("Bedroom", []), true);
  assert.equal(visibleSpeaker("Bridger's Speakers", ["bridgers speakers"]), true);
  assert.equal(visibleSpeaker("Nest Mini", ["Bridger's Speakers"]), false);
});
test("the output is the one playing, else the preferred, else the first you use", () => {
  assert.equal(pickOutput("Kitchen", "Bridger's Speakers", ["Bridger's Speakers"]), "Kitchen");
  assert.equal(pickOutput(null, "Bridger's Speakers", ["Bridger's Speakers", "Bedroom"]), "Bridger's Speakers");
  assert.equal(pickOutput(null, "Gone", ["Bedroom"]), "Bedroom");
  assert.equal(pickOutput(undefined, undefined, []), "Bridger's Speakers");
});
