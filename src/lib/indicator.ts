// The sliding "liquid glass" indicator behind a set of items (the rail, a segmented picker): where it goes, how much it stretches while travelling, and how long it takes.
export type Box = { left: number; top: number; width: number; height: number };

/** The indicator's resting box for an item (relative to the container). */
export const restBox = (item: Box): Box => ({ left: item.left, top: item.top, width: item.width, height: item.height });
/** Distance travelled between two boxes (px). */
export const travel = (a: Box, b: Box) => Math.hypot(b.left - a.left, b.top - a.top);
/** Stretch along the direction of travel: about 1.25 for a hop to the next item, more for a longer jump, never more than 1.7. */
export const stretchFor = (distance: number, itemSize: number) => (distance < 1 ? 1 : Math.min(1.7, 1.12 + 0.13 * (distance / Math.max(1, itemSize))));
/** 550 to 700 ms: a little longer for a longer jump. */
export const travelMs = (distance: number, itemSize: number) => Math.round(Math.min(700, 550 + 35 * Math.max(0, distance / Math.max(1, itemSize) - 1)));
/** Keyframes for the move (a mid-flight frame stretched along the travel axis, relaxing at rest). x/y are the translation from the first resting position. */
export function keyframes(from: Box, to: Box, itemSize: number): { transform: string; offset: number }[] {
  const d = travel(from, to), k = stretchFor(d, itemSize);
  const vertical = Math.abs(to.top - from.top) >= Math.abs(to.left - from.left);
  const sx = vertical ? 1 / Math.sqrt(k) : k, sy = vertical ? k : 1 / Math.sqrt(k);        // squash across, stretch along the travel
  const at = (t: number) => `translate3d(${from.left + (to.left - from.left) * t}px, ${from.top + (to.top - from.top) * t}px, 0)`;
  return [{ transform: `${at(0)} scale(1, 1)`, offset: 0 }, { transform: `${at(0.55)} scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`, offset: 0.55 }, { transform: `${at(1)} scale(1, 1)`, offset: 1 }];
}
