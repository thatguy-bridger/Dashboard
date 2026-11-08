// Live lyrics: which line is being sung right now. Pure: the position is re-derived from the clock on every call, so pauses and seeks are always right.

export type LyricLine = [number, string];                  // [seconds, text]
export type Lyrics = { id: string; lines: LyricLine[] };
export type LyricsMusic = { playing: boolean; progress: number; at: number; trackId?: string; duration?: number };

const LEAD = 0.3;                                          // show a line slightly early: the measurement and the screen are a little behind the sound

/** Index of the last line that has started by time t (binary search); -1 before the first line. Lines must be sorted by time. */
export function findLine(lines: LyricLine[], t: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid][0] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

/** Where in the song we are: the last measurement, extended by the clock while playing. */
export function songPosition(m: Pick<LyricsMusic, "playing" | "progress" | "at" | "duration">, nowMs: number): number {
  const p = m.progress + (m.playing ? Math.max(0, nowMs - m.at) / 1000 : 0);
  return m.duration ? Math.min(p, m.duration) : p;
}

export const isInstrumental = (text: string | undefined) => !text || /^[\s\u266a\u266b\u266c.\-\u2013\u2014_*]*$/.test(text);   // blank, or just note marks / dashes

export type LyricView = { index: number; lines: { i: number; offset: number; text: string; instrumental: boolean }[]; current: string; instrumental: boolean };

/** What to show, or null when there are no lyrics for this song or the music isn't playing. `span` = how many lines either side of the current one. */
export function lyricView(m: LyricsMusic | null | undefined, ly: Lyrics | null | undefined, nowMs: number, span = 3): LyricView | null {
  if (!m || !m.playing || !ly || !m.trackId || ly.id !== m.trackId || !ly.lines.length) return null;
  const t = songPosition(m, nowMs) + LEAD;
  const index = findLine(ly.lines, t);                     // -1: the intro, before the first line
  const out: LyricView["lines"] = [];
  for (let o = -span; o <= span; o++) {
    const i = index + o;
    if (i < 0 || i >= ly.lines.length) continue;
    const text = ly.lines[i][1] ?? "";
    out.push({ i, offset: o, text: isInstrumental(text) ? "" : text, instrumental: isInstrumental(text) });
  }
  const cur = index >= 0 ? ly.lines[index][1] : "";
  return { index, lines: out, current: isInstrumental(cur) ? "" : cur, instrumental: isInstrumental(cur) };
}

/** Tolerant parse of what Permuta saved (state:lyrics). */
export function parseLyrics(raw: unknown): Lyrics | null {
  const o = raw as { id?: unknown; lines?: unknown } | null;
  if (!o || typeof o.id !== "string" || !Array.isArray(o.lines)) return null;
  const lines: LyricLine[] = [];
  for (const l of o.lines) if (Array.isArray(l) && typeof l[0] === "number" && isFinite(l[0])) lines.push([l[0], typeof l[1] === "string" ? l[1] : ""]);
  lines.sort((a, b) => a[0] - b[0]);
  return { id: o.id, lines };
}
