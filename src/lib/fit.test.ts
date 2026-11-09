import test from "node:test";
import assert from "node:assert/strict";
import { fitFontSize } from "./fit.ts";

// a fake text: each line is `chars * size * 0.5` wide, wrapped at the box width, `size * 1.2` tall per line
const wrapped = (chars: number, boxW: number) => (size: number) => { const per = size * 0.5, perLine = Math.max(1, Math.floor(boxW / per)); const lines = Math.ceil(chars / perLine); return { w: Math.min(boxW, chars * per), h: lines * size * 1.2 }; };
const oneLine = (chars: number) => (size: number) => ({ w: chars * size * 0.5, h: size * 1.2 });

test("text that already fits keeps its size", () => assert.equal(fitFontSize(40, oneLine(10), { w: 800, h: 100 }), 40));
test("long text shrinks until it fits, however long, and no more than it must", () => {
  for (const chars of [60, 200, 1000]) {
    const m = wrapped(chars, 600), size = fitFontSize(48, m, { w: 600, h: 120 });
    assert.ok(size < 48 && m(size).h <= 121, `${chars} chars at ${size}`);
    assert.ok(m(size * 1.05).h > 121 || size * 1.05 > 48, `${chars} chars: ${size} is close to the biggest that fits`);
  }
});
test("a single long line shrinks to the width", () => { const s = fitFontSize(30, oneLine(120), { w: 500, h: 60 }); assert.ok(oneLine(120)(s).w <= 501); });
test("a zero-size box leaves the size alone", () => assert.equal(fitFontSize(30, oneLine(10), { w: 0, h: 0 }), 30));
test("never goes below the floor", () => assert.equal(fitFontSize(30, oneLine(100000), { w: 100, h: 20 }, 2), 2));
