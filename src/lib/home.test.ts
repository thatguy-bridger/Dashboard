import test from "node:test";
import assert from "node:assert/strict";
import { hsToHex, hexToHs, kelvinToHex, tintFor, pickerToHs, hsToPicker, SWATCHES } from "./color.ts";
import { tileReduce, TILE_IDLE, dragValue, type TileEvent, type TileState } from "./tile.ts";
import { placePopover } from "./popover.ts";
import { restBox, travel, stretchFor, travelMs, keyframes } from "./indicator.ts";
import { overridesFor, setOpt, applyHome, resolveOpt, reportedFor } from "./predict.ts";
import type { Home } from "./ha.ts";

test("hs to hex and back", () => {
  assert.equal(hsToHex(0, 100), "#ff0000"); assert.equal(hsToHex(120, 100), "#00ff00"); assert.equal(hsToHex(240, 100), "#0000ff"); assert.equal(hsToHex(60, 100), "#ffff00"); assert.equal(hsToHex(200, 0), "#ffffff"); assert.equal(hsToHex(360, 100), "#ff0000"); assert.equal(hsToHex(-120, 100), "#0000ff");
  for (const [h, s] of [[30, 80], [200, 55], [310, 100], [90, 40]] as [number, number][]) { const [h2, s2] = hexToHs(hsToHex(h, s)); assert.ok(Math.abs(h2 - h) < 1.5 && Math.abs(s2 - s) < 1.5, `${h},${s} -> ${h2},${s2}`); }
  assert.deepEqual(hexToHs("#ffffff"), [0, 0]);
});
test("kelvin tint: warm is warm, cool is cool, daylight is near white", () => {
  const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const warm = rgb(kelvinToHex(2200)), day = rgb(kelvinToHex(6500)), cool = rgb(kelvinToHex(9000));
  assert.ok(warm[0] > warm[2] + 80); assert.ok(day.every((c) => c > 235)); assert.ok(cool[2] > cool[0]);
  assert.equal(tintFor({}), "#ffd9a0"); assert.equal(tintFor({ color: [0, 100] }), hsToHex(0, 85)); assert.equal(tintFor({ color: [0, 3], kelvin: 3000 }), kelvinToHex(3000)); assert.equal(tintFor({ kelvin: 2700 }), kelvinToHex(2700));
});
test("picker: x is hue, y is saturation, both clamped, and they invert", () => {
  assert.deepEqual(pickerToHs(0, 0), [0, 100]); assert.deepEqual(pickerToHs(1, 1), [360, 0]); assert.deepEqual(pickerToHs(0.5, 0.5), [180, 50]); assert.deepEqual(pickerToHs(-3, 9), [0, 0]);
  assert.deepEqual(hsToPicker(180, 50), [0.5, 0.5]); assert.equal(SWATCHES.length, 8);
});

const run = (events: TileEvent[]) => { let s: TileState = TILE_IDLE; const acts: (string | null)[] = []; for (const e of events) { const r = tileReduce(s, e); s = r.state; acts.push(r.action); } return { s, acts: acts.filter(Boolean) as string[] }; };
test("tile: a quick press and release is a tap", () => assert.deepEqual(run([{ type: "down", x: 10, y: 10, t: 0 }, { type: "up", x: 11, y: 10, t: 120 }]).acts, ["tap"]));
test("tile: holding 400 ms fires hold once, and releasing it does NOT also tap", () => {
  const r = run([{ type: "down", x: 10, y: 10, t: 0 }, { type: "tick", x: 10, y: 10, t: 200 }, { type: "tick", x: 10, y: 10, t: 420 }, { type: "tick", x: 10, y: 10, t: 600 }, { type: "up", x: 10, y: 10, t: 700 }]);
  assert.deepEqual(r.acts, ["hold"]); assert.equal(r.s.phase, "idle");
});
test("tile: a drag past the threshold starts a drag, keeps dragging, ends it, and never taps or holds", () => {
  const r = run([{ type: "down", x: 100, y: 50, t: 0 }, { type: "move", x: 106, y: 50, t: 20 }, { type: "move", x: 120, y: 52, t: 40 }, { type: "move", x: 160, y: 52, t: 60 }, { type: "tick", x: 160, y: 52, t: 500 }, { type: "up", x: 170, y: 52, t: 520 }]);
  assert.deepEqual(r.acts, ["dragstart", "drag", "dragend"]);
});
test("tile: a small wobble is still a tap; a vertical move is a scroll (the tile steps aside)", () => {
  assert.deepEqual(run([{ type: "down", x: 10, y: 10, t: 0 }, { type: "move", x: 14, y: 13, t: 30 }, { type: "up", x: 14, y: 13, t: 90 }]).acts, ["tap"]);
  const r = run([{ type: "down", x: 10, y: 10, t: 0 }, { type: "move", x: 12, y: 40, t: 30 }, { type: "tick", x: 12, y: 40, t: 600 }, { type: "up", x: 12, y: 40, t: 650 }]);
  assert.deepEqual(r.acts, []); assert.equal(r.s.phase, "idle");
});
test("tile: moving during a hold changes nothing; cancel resets; stray events are ignored", () => {
  assert.deepEqual(run([{ type: "down", x: 0, y: 0, t: 0 }, { type: "tick", x: 0, y: 0, t: 450 }, { type: "move", x: 90, y: 0, t: 500 }, { type: "up", x: 90, y: 0, t: 520 }]).acts, ["hold"]);
  assert.deepEqual(run([{ type: "down", x: 0, y: 0, t: 0 }, { type: "cancel" }, { type: "up", x: 0, y: 0, t: 50 }]).acts, []);
  assert.deepEqual(run([{ type: "up", x: 0, y: 0, t: 1 }, { type: "tick", x: 0, y: 0, t: 999 }, { type: "move", x: 5, y: 5, t: 3 }]).acts, []);
});
test("drag value: the fill follows the finger from where it started, clamped", () => {
  assert.equal(dragValue(0.5, 100, 100, 200), 0.5); assert.equal(dragValue(0.5, 100, 150, 200), 0.75); assert.equal(dragValue(0.5, 100, 40, 200), 0.2); assert.equal(dragValue(0.9, 100, 300, 200), 1); assert.equal(dragValue(0.1, 100, -400, 200), 0);
});

test("popover placement: below if it fits, else above, else centred; always inside the screen", () => {
  const vp = { w: 1920, h: 1080 }, size = { w: 420, h: 360 };
  assert.deepEqual(placePopover({ x: 500, y: 200, w: 200, h: 120 }, size, vp), { x: 390, y: 330, side: "below" });
  assert.equal(placePopover({ x: 500, y: 800, w: 200, h: 120 }, size, vp).side, "above");
  assert.deepEqual(placePopover({ x: 500, y: 300, w: 200, h: 120 }, { w: 420, h: 900 }, vp), { x: 710, y: 12, side: "right" });          // tall: beside the tile
  assert.equal(placePopover({ x: 1500, y: 300, w: 300, h: 120 }, { w: 420, h: 900 }, vp).side, "left");
  assert.equal(placePopover({ x: 300, y: 300, w: 1300, h: 120 }, { w: 420, h: 900 }, vp).side, "center");                                  // nowhere else fits
  assert.equal(placePopover({ x: 0, y: 100, w: 100, h: 100 }, size, vp).x, 12); assert.equal(placePopover({ x: 1850, y: 100, w: 60, h: 100 }, size, vp).x, 1920 - 420 - 12);
  const small = placePopover({ x: 20, y: 20, w: 100, h: 60 }, { w: 900, h: 700 }, { w: 800, h: 480 }); assert.ok(small.x >= 12 && small.y >= 12);
});

test("indicator math: position, stretch and duration", () => {
  const item = (i: number) => ({ left: 4, top: 4 + i * 70, width: 64, height: 64 });
  assert.deepEqual(restBox(item(2)), item(2)); assert.equal(travel(item(0), item(1)), 70); assert.equal(travel(item(0), item(0)), 0);
  assert.equal(stretchFor(0, 64), 1); assert.ok(Math.abs(stretchFor(70, 64) - 1.26) < 0.02);                      // one hop: about 1.25
  assert.ok(stretchFor(280, 64) > stretchFor(70, 64)); assert.equal(stretchFor(5000, 64), 1.7);                    // farther stretches more, with a cap
  assert.equal(travelMs(70, 64), 553); assert.ok(travelMs(70 * 5, 64) > travelMs(70, 64)); assert.equal(travelMs(99999, 64), 700); assert.ok(travelMs(10, 64) >= 550);
  const k = keyframes(item(0), item(3), 64);
  assert.equal(k.length, 3); assert.equal(k[0].offset, 0); assert.equal(k[2].offset, 1);
  assert.ok(k[0].transform.includes("translate3d(4px, 4px, 0) scale(1, 1)")); assert.ok(k[2].transform.includes("translate3d(4px, 214px, 0) scale(1, 1)"));
  const mid = k[1].transform.match(/scale\(([\d.]+), ([\d.]+)\)/)!; assert.ok(Number(mid[2]) > 1 && Number(mid[1]) < 1);        // vertical travel: stretched along y, squashed across x
  const h = keyframes(item(0), { ...item(0), left: 200 }, 64)[1].transform.match(/scale\(([\d.]+), ([\d.]+)\)/)!; assert.ok(Number(h[1]) > 1 && Number(h[2]) < 1);   // horizontal: the other way
});

test("colour is optimistic too: shown at once, confirmed by a close report, reverted if the reports disagree", () => {
  const home: Home = { configured: true, reachable: true, away: false, musicLights: false, rooms: ["Den"], devices: [{ id: "light.a", name: "Bulb", kind: "light", room: "Den", on: true, dimmable: true, brightness: 0.5, color: [30, 40] }] as Home["devices"] };
  const patch = overridesFor({ op: "color", ids: ["light.a"], h: 200, s: 70 } as never, home);
  assert.deepEqual(patch, { "dev:light.a:color": [200, 70], "dev:light.a:on": true });
  const m = setOpt({}, patch, 1000);
  assert.deepEqual(applyHome(home, m)!.devices[0].color, [200, 70]); assert.equal(applyHome(home, m)!.devices[0].brightness, 0.5);   // brightness untouched
  const reported = JSON.parse(JSON.stringify(home)) as Home; reported.devices[0].color = [201, 69];
  assert.deepEqual(resolveOpt(m, reportedFor(m, reported, null), 2000), {});                                                     // a close report confirms it
  assert.deepEqual(Object.keys(resolveOpt(m, reportedFor(m, home, null), 2000)), ["dev:light.a:color"]);                    // "on" is already true in the report, so only the colour is still waiting
  assert.deepEqual(resolveOpt(m, reportedFor(m, home, null), 8000), {});
  const warm = overridesFor({ op: "kelvin", ids: ["light.a", "light.b"], k: 3000 } as never); assert.deepEqual(Object.keys(warm).sort(), ["dev:light.a:kelvin", "dev:light.a:on", "dev:light.b:kelvin", "dev:light.b:on"].sort());
});
