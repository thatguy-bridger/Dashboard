// A layout checker: no two main areas may overlap. Pure geometry, so it can be tested; the page runs it over the real DOM (window.__layoutCheck in the mock harness).
export type Box = { name: string; x: number; y: number; w: number; h: number };

/** Do two boxes overlap by more than `slop` pixels in both directions? (Touching edges and sub-pixel rounding don't count.) */
export const intersects = (a: Box, b: Box, slop = 1.5) => a.x + a.w - slop > b.x && b.x + b.w - slop > a.x && a.y + a.h - slop > b.y && b.y + b.h - slop > a.y;

export function findOverlaps(boxes: Box[], slop = 1.5): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxes[i].w > 0 && boxes[i].h > 0 && boxes[j].w > 0 && boxes[j].h > 0 && intersects(boxes[i], boxes[j], slop)) out.push([boxes[i].name, boxes[j].name]);
  return out;
}
/** Is the box fully inside the container (with a little tolerance)? */
export const inside = (b: Box, c: Box, tol = 2) => b.x >= c.x - tol && b.y >= c.y - tol && b.x + b.w <= c.x + c.w + tol && b.y + b.h <= c.y + c.h + tol;
