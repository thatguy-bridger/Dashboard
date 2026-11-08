import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The display uses the SVG icon set (src/components/Icon.tsx), never emoji. Text that comes from the user's own data may contain emoji at runtime; our source may not.
const FORBIDDEN = /[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}⌀-⏿☀-➿⬀-⯿️‍]/u;
function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (f === "no-emoji.test.ts") continue; else if (/\.(ts|tsx|css|md)$/.test(f)) out.push(p); }
  return out;
}
test("no emoji or pictographic symbols anywhere in src/", () => {
  const bad: string[] = [];
  for (const f of walk("src")) {
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((l, i) => { const m = l.match(FORBIDDEN); if (m) bad.push(`${f}:${i + 1} ${JSON.stringify(m[0])}`); });
  }
  assert.deepEqual(bad, []);
});
