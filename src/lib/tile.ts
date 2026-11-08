// A Home tile: TAP toggles, DRAG across it sets a level, HOLD (about 400 ms) opens the device's detail popover. One small state machine so the three never fight:
// a hold never also fires a tap when released, a drag never fires a tap, and a mostly vertical movement is a scroll (the tile steps aside).

export type TilePhase = "idle" | "down" | "drag" | "hold";
export type TileState = { phase: TilePhase; x0: number; y0: number; t0: number };
export type TileEvent = { type: "down" | "move" | "up" | "tick"; x: number; y: number; t: number } | { type: "cancel" };
export type TileAction = "tap" | "hold" | "dragstart" | "drag" | "dragend" | null;
export const TILE_IDLE: TileState = { phase: "idle", x0: 0, y0: 0, t0: 0 };
export const TILE_DEFAULTS = { holdMs: 400, dragSlop: 12 };

export function tileReduce(s: TileState, e: TileEvent, o: { holdMs?: number; dragSlop?: number } = {}): { state: TileState; action: TileAction } {
  const holdMs = o.holdMs ?? TILE_DEFAULTS.holdMs, slop = o.dragSlop ?? TILE_DEFAULTS.dragSlop;
  if (e.type === "cancel") return { state: TILE_IDLE, action: null };
  if (e.type === "down") return { state: { phase: "down", x0: e.x, y0: e.y, t0: e.t }, action: null };
  if (s.phase === "idle") return { state: s, action: null };
  const dx = e.x - s.x0, dy = e.y - s.y0;
  if (e.type === "tick") return s.phase === "down" && e.t - s.t0 >= holdMs ? { state: { ...s, phase: "hold" }, action: "hold" } : { state: s, action: null };
  if (e.type === "move") {
    if (s.phase === "down") {
      if (Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx)) return { state: TILE_IDLE, action: null };       // a vertical move is a scroll
      if (Math.abs(dx) > slop) return { state: { ...s, phase: "drag" }, action: "dragstart" };
    }
    if (s.phase === "drag") return { state: s, action: "drag" };
    return { state: s, action: null };                                                                           // moving during a hold changes nothing
  }
  // up
  if (s.phase === "down") return { state: TILE_IDLE, action: "tap" };
  if (s.phase === "drag") return { state: TILE_IDLE, action: "dragend" };
  return { state: TILE_IDLE, action: null };                                                                     // released after a hold: no tap
}

/** The level while dragging: the starting level plus how far the finger has moved across the tile (the fill follows the finger). */
export const dragValue = (start: number, x0: number, x: number, width: number) => Math.max(0, Math.min(1, start + (x - x0) / Math.max(1, width)));
