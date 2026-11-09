// Shrink-to-fit for text that must always be fully visible (live lyrics). `measure(size)` returns how big the text is when drawn at that
// font size (width and height of its content); the answer is the LARGEST size, not above `base`, at which it fits the box. There is no
// practical lower limit (`min` only stops runaway loops), so even a very long line is shown in full, just smaller.
export type Box = { w: number; h: number };

export function fitFontSize(base: number, measure: (size: number) => Box, box: Box, min = 2): number {
  if (box.w <= 0 || box.h <= 0) return base;
  const fits = (s: number) => { const m = measure(s); return m.w <= box.w + 1 && m.h <= box.h + 1; };
  if (fits(base)) return base;
  let hi = base, lo = min;
  if (!fits(lo)) return min;                                   // can't fit even at the floor: show it at the floor
  for (let i = 0; i < 18; i++) {                               // binary search: wrapping makes the fit non-linear, so don't guess
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return lo;
}
