import test from "node:test";
import assert from "node:assert/strict";
import { DEVICE_DEFAULTS, resolveDevice, mergeDevice, cleanPatch, isControl, forcedView, makeDeviceId, validDeviceId, sanitizeInfo, NAME_MAX } from "./device.ts";
import { holdProgress, registerTap, inCorner, holdMoved, HOLD_MS } from "./gesture.ts";

test("defaults: a display, auto view, unlocked, dims automatically", () => {
  assert.deepEqual(DEVICE_DEFAULTS, { name: "", role: "display", view: "auto", locked: false, dim: "auto", guest: false });
  assert.deepEqual(resolveDevice(null), DEVICE_DEFAULTS); assert.deepEqual(resolveDevice("x"), DEVICE_DEFAULTS); assert.deepEqual(resolveDevice([]), DEVICE_DEFAULTS); assert.deepEqual(resolveDevice({}), DEVICE_DEFAULTS);
});
test("resolve: valid fields are kept, invalid ones fall back to the default", () => {
  assert.deepEqual(resolveDevice({ name: "  Kitchen  panel ", role: "control", view: "home", locked: true, dim: "never" }), { name: "Kitchen panel", role: "control", view: "home", locked: true, dim: "never", guest: false });
  assert.deepEqual(resolveDevice({ role: "admin", view: "nope", locked: "yes", dim: 3, name: 7, extra: 1 }), DEVICE_DEFAULTS);
  assert.equal(resolveDevice({ name: "x".repeat(200) }).name.length, NAME_MAX);
});
test("merge: a patch changes only what it names, and bad values are ignored", () => {
  const base = resolveDevice({ name: "Den", role: "display", view: "music" });
  assert.deepEqual(mergeDevice(base, { locked: true }), { ...base, locked: true });
  assert.deepEqual(mergeDevice(base, { role: "control" }).role, "control");
  assert.deepEqual(mergeDevice(base, { role: "bogus", view: "calm" }), { ...base, view: "calm" });
  assert.deepEqual(mergeDevice(base, null), base);
  assert.deepEqual(cleanPatch({ foo: 1, locked: false }), { locked: false });
});
test("control: role control, or the home view", () => {
  assert.equal(isControl(resolveDevice({ role: "control" })), true); assert.equal(isControl(resolveDevice({ view: "home" })), true); assert.equal(isControl(DEVICE_DEFAULTS), false);
});
test("forced view: what each view means for a display", () => {
  const f = (v: unknown) => forcedView(resolveDevice({ view: v }));
  assert.deepEqual(f("auto"), { kind: "auto" }); assert.deepEqual(f("standby"), { kind: "scene", scene: "idle" }); assert.deepEqual(f("music"), { kind: "scene", scene: "music" });
  assert.deepEqual(f("timeline"), { kind: "scene", scene: "day" }); assert.deepEqual(f("calm"), { kind: "calm" }); assert.deepEqual(f("home"), { kind: "control" });
  assert.deepEqual(forcedView(resolveDevice({ role: "control", view: "music" })), { kind: "control" });          // the control role wins
});
test("device id: hex, long enough, and validated", () => {
  const id = makeDeviceId(new Uint8Array([0, 1, 171, 255, 16, 32, 64, 128]));
  assert.equal(id, "0001abff10204080"); assert.ok(id.length >= 8); assert.equal(validDeviceId(id), true);
  assert.equal(validDeviceId("short"), false); assert.equal(validDeviceId("has space in it"), false); assert.equal(validDeviceId(5), false); assert.equal(validDeviceId("a".repeat(65)), false);
});
test("ping info is sanitised", () => {
  const i = sanitizeInfo({ ua: "u".repeat(500), w: 1920.4, h: -5, scene: "music", mode: "focus", ver: "abc", name: "n", junk: 1 });
  assert.equal(i.ua?.length, 200); assert.equal(i.w, 1920); assert.equal(i.h, 0); assert.equal(i.scene, "music"); assert.ok(!("junk" in i));
  assert.deepEqual(sanitizeInfo(null), { battery: undefined, ua: undefined, w: undefined, h: undefined, scene: undefined, mode: undefined, ver: undefined, name: undefined });
});

test("hold: progress runs 0 to 1 over three seconds and never leaves that range", () => {
  assert.equal(HOLD_MS, 3000);
  assert.equal(holdProgress(1000, 1000), 0); assert.equal(holdProgress(1000, 2500), 0.5); assert.equal(holdProgress(1000, 4000), 1); assert.equal(holdProgress(1000, 9999), 1); assert.equal(holdProgress(1000, 500), 0);
  assert.ok(holdProgress(0, 2999) < 1);                                  // not fired a hair early
});
test("taps: five within two seconds fire; slow or too few do not; the count resets", () => {
  let st = { taps: [] as number[], fired: false };
  for (const t of [0, 300, 600, 900]) { st = registerTap(st.taps, t); assert.equal(st.fired, false); }
  st = registerTap(st.taps, 1200); assert.equal(st.fired, true); assert.deepEqual(st.taps, []);
  // too slow: only the last few stay in the window
  st = { taps: [], fired: false };
  for (const t of [0, 1000, 2000, 3000, 4000, 5000]) st = registerTap(st.taps, t);
  assert.equal(st.fired, false);
  // after a fire it starts again from zero
  st = registerTap([], 10_000); assert.equal(st.fired, false); assert.equal(st.taps.length, 1);
  assert.equal(registerTap([0, 100, 200, 300], 5000, { need: 5, windowMs: 2000 }).fired, false);              // old taps expired
  assert.equal(registerTap([0, 100, 200], 300, { need: 4 }).fired, true);
});
test("corner and wander", () => {
  assert.equal(inCorner(10, 10, 1920, 1080), true); assert.equal(inCorner(129, 129, 1920, 1080), true); assert.equal(inCorner(131, 50, 1920, 1080), false); assert.equal(inCorner(50, 131, 1920, 1080), false); assert.equal(inCorner(1800, 10, 1920, 1080), false); assert.equal(inCorner(-1, 5, 1920, 1080), false);
  assert.equal(holdMoved(100, 100, 110, 105), false); assert.equal(holdMoved(100, 100, 160, 100), true);
});
