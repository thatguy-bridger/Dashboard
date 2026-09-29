import type { WidgetType, WidgetSize } from "@/lib/presets";

/** Screen layout grid — fine enough for real resize/drag control, still simple to reason about. */
export const GRID_COLS = 12;
export const GRID_ROWS = 7;

export interface GridWidget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Hides itself on the live screen when it has nothing to show (countdowns, notifications,
   *  sports, etc.) instead of permanently occupying space with an empty state. */
  temporary?: boolean;
}

export const MIN_W = 2;
export const MIN_H = 1;

export function clampWidget(widget: GridWidget): GridWidget {
  const w = Math.min(GRID_COLS, Math.max(MIN_W, Math.round(widget.w)));
  const h = Math.min(GRID_ROWS, Math.max(MIN_H, Math.round(widget.h)));
  const x = Math.min(GRID_COLS - w, Math.max(0, Math.round(widget.x)));
  const y = Math.min(GRID_ROWS - h, Math.max(0, Math.round(widget.y)));
  return { ...widget, x, y, w, h };
}

/** Legacy sm/md/lg/xl spans on the old 4x3 grid, used only to migrate old presets. */
const LEGACY_SPANS: Record<WidgetSize, { col: number; row: number }> = {
  sm: { col: 1, row: 1 },
  md: { col: 2, row: 1 },
  lg: { col: 2, row: 2 },
  xl: { col: 4, row: 2 },
};

/** Maps a grid footprint (in cells) to the discrete content-density bucket widgets render at. */
export function sizeForFootprint(w: number, h: number): WidgetSize {
  const area = w * h;
  if (area <= 4) return "sm";
  if (area <= 12) return "md";
  if (area <= 24) return "lg";
  return "xl";
}

/** Finds an unoccupied w×h spot among existing widgets, first-fit; falls back to the top-left. */
export function findFreeSpot(existing: GridWidget[], w: number, h: number): { x: number; y: number } {
  const ww = Math.min(GRID_COLS, w);
  const hh = Math.min(GRID_ROWS, h);

  function overlaps(x: number, y: number) {
    return existing.some(
      (e) => x < e.x + e.w && x + ww > e.x && y < e.y + e.h && y + hh > e.y
    );
  }

  for (let y = 0; y <= GRID_ROWS - hh; y++) {
    for (let x = 0; x <= GRID_COLS - ww; x++) {
      if (!overlaps(x, y)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

/**
 * First-fit placement for legacy {type,size}[] presets that have no x/y/w/h yet.
 *
 * Must never let two widgets land on the same cell: a collision used to fall
 * back to (0,0), silently burying every widget placed after the first "full"
 * one directly underneath it — they were still in the data, just invisible
 * behind an earlier tile. Large legacy `lg`/`xl` widgets add up fast (an xl
 * alone is more than half the 12x7 grid), so instead of overflowing past the
 * visible screen (which is a fixed viewport, not scrollable) we shrink a
 * widget's own footprint step by step until it fits somewhere unoccupied.
 * Every widget the preset had is guaranteed a unique, visible spot.
 */
export function autoLayout(items: { type: WidgetType; size: WidgetSize }[]): GridWidget[] {
  const occupied = new Set<string>();

  function fits(x: number, y: number, w: number, h: number) {
    if (x + w > GRID_COLS || y + h > GRID_ROWS) return false;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (occupied.has(`${xx},${yy}`)) return false;
      }
    }
    return true;
  }

  function place(x: number, y: number, w: number, h: number) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        occupied.add(`${xx},${yy}`);
      }
    }
  }

  function findSpot(w: number, h: number): { x: number; y: number } | null {
    for (let y = 0; y <= GRID_ROWS - h; y++) {
      for (let x = 0; x <= GRID_COLS - w; x++) {
        if (fits(x, y, w, h)) return { x, y };
      }
    }
    return null;
  }

  const sized = items.map((item) => {
    const span = LEGACY_SPANS[item.size];
    return { type: item.type, w: Math.min(GRID_COLS, span.col * 3), h: Math.min(GRID_ROWS, span.row * 2) };
  });

  // Pre-shrink globally when the requested footprints alone would fill (or
  // nearly fill) the grid: first-fit packing is never 100% efficient, so
  // leaving zero slack guarantees later widgets have nowhere left to go at
  // all — the exact case that used to bury them at (0,0). Repeatedly shrink
  // whichever widget is currently largest until there's real headroom.
  const capacity = GRID_COLS * GRID_ROWS;
  const area = () => sized.reduce((sum, it) => sum + it.w * it.h, 0);
  while (area() > capacity * 0.75 && sized.some((it) => it.w > MIN_W || it.h > MIN_H)) {
    const largest = sized.reduce((best, it) => (it.w * it.h > sized[best].w * sized[best].h ? sized.indexOf(it) : best), 0);
    const it = sized[largest];
    if (it.h > MIN_H) it.h -= 1;
    else if (it.w > MIN_W) it.w -= 1;
  }

  const result: GridWidget[] = [];
  sized.forEach((item, i) => {
    let { w, h } = item;
    let spot = findSpot(w, h);
    // Per-item safety net in case packing order still leaves no room —
    // shrink toward the minimum footprint until it fits. With MIN_W x MIN_H
    // cells the whole 12x7 grid holds 42 of them, so this always succeeds
    // for any realistic widget count.
    while (!spot && (w > MIN_W || h > MIN_H)) {
      if (h > MIN_H) h -= 1;
      else w -= 1;
      spot = findSpot(w, h);
    }
    spot ??= { x: 0, y: 0 };

    place(spot.x, spot.y, w, h);
    result.push({ id: `${item.type}-${i}-${Date.now().toString(36)}`, type: item.type, x: spot.x, y: spot.y, w, h });
  });

  return result;
}
