import test from "node:test";
import assert from "node:assert/strict";
import { findLine, songPosition, lyricView, parseLyrics, isInstrumental, type Lyrics } from "./lyrics.ts";

const L: Lyrics = { id: "abc", lines: [[5, "one"], [10, "two"], [15, ""], [20, "three"], [30, "four"]] };
const music = (over = {}) => ({ playing: true, progress: 0, at: 1_000_000, trackId: "abc", ...over });

test("findLine: before, exactly on, between, after the last", () => {
  assert.equal(findLine(L.lines, 0), -1);
  assert.equal(findLine(L.lines, 4.99), -1);
  assert.equal(findLine(L.lines, 5), 0);
  assert.equal(findLine(L.lines, 9.9), 0);
  assert.equal(findLine(L.lines, 10), 1);
  assert.equal(findLine(L.lines, 29.99), 3);
  assert.equal(findLine(L.lines, 999), 4);
  assert.equal(findLine([], 5), -1);
  // many lines, random probes agree with a linear scan
  const big: Lyrics["lines"] = Array.from({ length: 500 }, (_, i) => [i * 2.5, `l${i}`]);
  for (let k = 0; k < 200; k++) { const t = Math.random() * 1300; let lin = -1; for (let i = 0; i < big.length; i++) if (big[i][0] <= t) lin = i; assert.equal(findLine(big, t), lin); }
});

test("songPosition: extends the measurement by the clock only while playing, never past the end", () => {
  assert.equal(songPosition({ playing: true, progress: 40, at: 1000, duration: 200 }, 1000 + 5000), 45);
  assert.equal(songPosition({ playing: false, progress: 40, at: 1000, duration: 200 }, 1000 + 5000), 40);   // paused: it doesn't advance
  assert.equal(songPosition({ playing: true, progress: 198, at: 1000, duration: 200 }, 1000 + 9000), 200);
  assert.equal(songPosition({ playing: true, progress: 10, at: 5000, duration: 200 }, 4000), 10);          // a clock slightly behind never goes backwards
});

test("lyricView: only for the matching song while playing", () => {
  assert.equal(lyricView(music({ trackId: "zzz" }), L, 1_000_000), null);
  assert.equal(lyricView(music({ playing: false }), L, 1_000_000), null);
  assert.equal(lyricView(music(), null, 1_000_000), null);
  assert.equal(lyricView(music(), { id: "abc", lines: [] }, 1_000_000), null);
  assert.equal(lyricView(null, L, 0), null);
});

test("lyricView: current line follows the clock, with a small lead", () => {
  const at = (sec: number, m = {}) => lyricView(music(m), L, 1_000_000 + sec * 1000)!;
  assert.equal(at(1).index, -1);                     // intro
  assert.equal(at(4.8).index, 0);                    // 4.8 + 0.3 lead >= 5: a touch early
  assert.equal(at(4.6).index, -1);
  assert.equal(at(12).current, "two");
  assert.equal(at(25).current, "three");
  assert.equal(at(100).current, "four");             // after the last line it stays on it
  assert.deepEqual(at(12).lines.map((l) => l.offset), [-1, 0, 1, 2, 3]);   // neighbours either side, clipped to the lyrics
});

test("lyricView: a seek is correct at once, and a pause/resume doesn't drift", () => {
  const m1 = music({ progress: 0 });
  assert.equal(lyricView(m1, L, 1_000_000 + 12_000)!.current, "two");
  const seeked = music({ progress: 22, at: 1_000_000 + 12_000 });                 // user jumped to 0:22 at 12 s
  assert.equal(lyricView(seeked, L, 1_000_000 + 12_000)!.current, "three");
  assert.equal(lyricView(seeked, L, 1_000_000 + 12_000 + 8000)!.current, "four");
  assert.equal(lyricView(music({ playing: false, progress: 12 }), L, 1_000_000 + 50_000), null);
  const resumed = music({ progress: 12, at: 1_000_000 + 50_000 });               // resumed after 38 s of pause
  assert.equal(lyricView(resumed, L, 1_000_000 + 50_000)!.current, "two");
});

test("blank and instrumental lines are flagged so the page can draw a note icon", () => {
  assert.equal(isInstrumental(""), true); assert.equal(isInstrumental("\u266a"), true); assert.equal(isInstrumental(" \u266b \u266b "), true); assert.equal(isInstrumental("hello"), false);
  const v = lyricView(music(), L, 1_000_000 + 16_000)!;
  assert.equal(v.instrumental, true); assert.equal(v.current, "");   // the page draws a note icon for these
});

test("parseLyrics is tolerant", () => {
  assert.equal(parseLyrics(null), null); assert.equal(parseLyrics({ id: 3, lines: [] }), null); assert.equal(parseLyrics({ id: "a" }), null);
  const p = parseLyrics({ id: "a", lines: [[9, "b"], ["x", "bad"], [1, "a"], [3], null] })!;
  assert.deepEqual(p.lines, [[1, "a"], [3, ""], [9, "b"]]);
});
