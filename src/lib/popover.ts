export type Rect = { x: number; y: number; w: number; h: number };
/** Where a popover goes: below its anchor if it fits, otherwise above, otherwise beside it (right, then left), otherwise centred; always inside the viewport with a margin. */
export function placePopover(anchor: Rect, size: { w: number; h: number }, vp: { w: number; h: number }, o: { gap?: number; margin?: number } = {}): { x: number; y: number; side: "below" | "above" | "right" | "left" | "center" } {
  const gap = o.gap ?? 10, m = o.margin ?? 12;
  const w = Math.min(size.w, vp.w - 2 * m), h = Math.min(size.h, vp.h - 2 * m);
  const x = Math.max(m, Math.min(vp.w - w - m, anchor.x + anchor.w / 2 - w / 2));
  const below = anchor.y + anchor.h + gap, above = anchor.y - gap - h;
  if (below + h <= vp.h - m) return { x, y: below, side: "below" };
  if (above >= m) return { x, y: above, side: "above" };
  const y = Math.max(m, Math.min(vp.h - h - m, anchor.y + anchor.h / 2 - h / 2)), rightX = anchor.x + anchor.w + gap, leftX = anchor.x - gap - w;      // no room above or below: beside the tile
  if (rightX + w <= vp.w - m) return { x: rightX, y, side: "right" };
  if (leftX >= m) return { x: leftX, y, side: "left" };
  return { x, y: Math.max(m, (vp.h - h) / 2), side: "center" };
}
