import test from "node:test";
import assert from "node:assert/strict";
import { musicError, parsePlaylists, parseSpeakers, playCommand } from "./playlists.ts";

test("playlists parse and bad rows are skipped", () => {
  const p = parsePlaylists({ items: [{ id: "1", uri: "spotify:playlist:1", name: "Drive", image: "x", count: 12 }, { id: "2" }, null, { id: "3", uri: "spotify:playlist:3", name: "Chill" }] });
  assert.equal(p.length, 2); assert.equal(p[0].count, 12); assert.equal(p[1].image, undefined);
  assert.deepEqual(parsePlaylists(null), []);
});
test("speakers parse", () => assert.deepEqual(parseSpeakers({ items: [{ name: "Bridger's Speakers" }, { name: "" }, {}] }), ["Bridger's Speakers"]));
test("a start error is only shown if it is newer than the tap", () => {
  assert.equal(musicError({ message: "no", at: 100 }, 200), null);
  assert.equal(musicError({ message: "no", at: 300 }, 200), "no");
  assert.equal(musicError(undefined, 0), null);
});
test("play commands", () => {
  assert.deepEqual(playCommand("spotify:playlist:1", "Kitchen"), { action: "play", uri: "spotify:playlist:1", speaker: "Kitchen" });
  assert.deepEqual(playCommand(null, "Kitchen"), { action: "resume", speaker: "Kitchen" });
});
