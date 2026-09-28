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

/** First-fit placement for legacy {type,size}[] presets that have no x/y/w/h yet. */
export function autoLayout(items: { type: WidgetType; size: WidgetSize }[]): GridWidget[] {
  const occupied: boolean[][] = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(false));

  function fits(x: number, y: number, w: number, h: number) {
    if (x + w > GRID_COLS || y + h > GRID_ROWS) return false;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (occupied[yy][xx]) return false;
      }
    }
    return true;
  }

  function place(x: number, y: number, w: number, h: number) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        occupied[yy][xx] = true;
      }
    }
  }

  const result: GridWidget[] = [];
  items.forEach((item, i) => {
    const span = LEGACY_SPANS[item.size];
    const w = Math.min(GRID_COLS, span.col * 3);
    const h = Math.min(GRID_ROWS, span.row * 2);

    let placedAt: { x: number; y: number } | null = null;
    outer: for (let y = 0; y <= GRID_ROWS - h; y++) {
      for (let x = 0; x <= GRID_COLS - w; x++) {
        if (fits(x, y, w, h)) {
          placedAt = { x, y };
          break outer;
        }
      }
    }
    const { x, y } = placedAt ?? { x: 0, y: 0 };
    place(x, y, w, h);
    result.push({ id: `${item.type}-${i}-${Date.now().toString(36)}`, type: item.type, x, y, w, h });
  });

  return result;
}
