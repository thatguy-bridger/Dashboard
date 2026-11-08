import test from "node:test";
import assert from "node:assert/strict";
import { lightsView } from "./lights.ts";
import { findOverlaps, intersects, inside } from "./layout.ts";

test("the lights row: hidden unless on; only art and white lights; tolerant colours", () => {
  assert.equal(lightsView(null), null); assert.equal(lightsView({ on: false, lights: [{ id: "a", name: "A", mode: "art" }] }), null);
  const v = lightsView({ on: true, lights: [{ id: "light.a", name: "Light bar 1", mode: "art", color: "#ff8800" }, { id: "light.b", name: "Lamp", mode: "white", color: "red" }, { id: "light.c", name: "Off one", mode: "off" }, { id: "light.d", name: "Left alone", mode: "leave" }, { id: "x" } as never] })!;
  assert.deepEqual(v.map((l) => l.id), ["light.a", "light.b"]); assert.equal(v[0].color, "#ff8800"); assert.equal(v[1].color, "#ece9e4");
  assert.equal(lightsView({ on: true, lights: [{ id: "a", name: "A", mode: "off" }] }), null);                    // nothing to show: the whole row hides
  assert.equal(lightsView({ on: "yes" as never, lights: [] }), null);
});
test("layout checker: overlap detection ignores touching edges and rounding", () => {
  const b = (name: string, x: number, y: number, w: number, h: number) => ({ name, x, y, w, h });
  assert.equal(intersects(b("a", 0, 0, 100, 50), b("b", 100, 0, 100, 50)), false);                  // touching
  assert.equal(intersects(b("a", 0, 0, 100, 50), b("b", 99, 0, 100, 50)), false);                   // a pixel of rounding
  assert.equal(intersects(b("a", 0, 0, 100, 50), b("b", 90, 10, 100, 50)), true);
  assert.deepEqual(findOverlaps([b("rail", 0, 0, 50, 400), b("head", 60, 0, 300, 60), b("hero", 60, 70, 300, 200), b("pill", 280, 10, 100, 30)]), [["head", "pill"]]);
  assert.deepEqual(findOverlaps([b("x", 0, 0, 0, 0), b("y", 0, 0, 10, 10)]), []);                   // empty boxes don't count
  assert.equal(inside(b("c", 10, 10, 50, 50), b("p", 0, 0, 100, 100)), true); assert.equal(inside(b("c", 60, 10, 50, 50), b("p", 0, 0, 100, 100)), false);
});
