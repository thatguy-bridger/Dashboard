"use client";

import { useCallback, useRef, useState } from "react";
import { GRID_COLS, GRID_ROWS, MIN_W, MIN_H, clampWidget, sizeForFootprint, type GridWidget } from "@/lib/grid";
import { WidgetRenderer } from "@/components/WidgetRenderer";
import { ScreenBackground } from "@/components/ScreenBackground";
import { DEFAULT_BACKGROUND, type BackgroundConfig } from "@/lib/background";

type DragMode = { kind: "move" | "resize"; id: string; startX: number; startY: number; origin: GridWidget };

export function GridEditor({
  widgets,
  onChange,
  selectedId,
  onSelect,
  background = DEFAULT_BACKGROUND,
}: {
  widgets: GridWidget[];
  onChange: (widgets: GridWidget[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Rendered live behind the widgets so the editor matches what the real screen looks like. */
  background?: BackgroundConfig;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode | null>(null);

  const cellSize = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { cw: 1, ch: 1 };
    return { cw: rect.width / GRID_COLS, ch: rect.height / GRID_ROWS };
  }, []);

  const updateWidget = useCallback(
    (id: string, patch: Partial<GridWidget>) => {
      onChange(widgets.map((w) => (w.id === id ? clampWidget({ ...w, ...patch }) : w)));
    },
    [widgets, onChange]
  );

  function startDrag(kind: DragMode["kind"], widget: GridWidget, e: React.PointerEvent) {
    e.stopPropagation();
    onSelect(widget.id);
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ kind, id: widget.id, startX: e.clientX, startY: e.clientY, origin: widget });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const { cw, ch } = cellSize();
    const dxCells = Math.round((e.clientX - drag.startX) / cw);
    const dyCells = Math.round((e.clientY - drag.startY) / ch);

    if (drag.kind === "move") {
      updateWidget(drag.id, { x: drag.origin.x + dxCells, y: drag.origin.y + dyCells });
    } else {
      updateWidget(drag.id, {
        w: Math.max(MIN_W, drag.origin.w + dxCells),
        h: Math.max(MIN_H, drag.origin.h + dyCells),
      });
    }
  }

  function endDrag() {
    setDrag(null);
  }

  function removeWidget(id: string) {
    onChange(widgets.filter((w) => w.id !== id));
    if (selectedId === id) onSelect(null);
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={() => onSelect(null)}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      className="relative w-full rounded-xl overflow-hidden border border-[var(--surface-border)] select-none touch-none p-[0.9375rem]"
      style={{ aspectRatio: "1280 / 720", backgroundColor: "#05060a" }}
    >
      <ScreenBackground config={background} fixed={false} />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            `linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),` +
            `linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)`,
          backgroundSize: `${100 / GRID_COLS}% ${100 / GRID_ROWS}%`,
        }}
      />
      {widgets.map((w) => {
        const isSelected = selectedId === w.id;
        return (
          <div
            key={w.id}
            onPointerDown={(e) => startDrag("move", w, e)}
            className={`group tile tile-${w.type} absolute cursor-grab active:cursor-grabbing transition-shadow ${
              isSelected ? "ring-2 ring-[var(--accent)]" : ""
            }`}
            style={{
              left: `calc(${(w.x / GRID_COLS) * 100}% + 0.1875rem)`,
              top: `calc(${(w.y / GRID_ROWS) * 100}% + 0.1875rem)`,
              width: `calc(${(w.w / GRID_COLS) * 100}% - 0.375rem)`,
              height: `calc(${(w.h / GRID_ROWS) * 100}% - 0.375rem)`,
            }}
          >
            <div className="w-full h-full pointer-events-none">
              <WidgetRenderer type={w.type} size={sizeForFootprint(w.w, w.h)} />
            </div>

            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => removeWidget(w.id)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-[var(--muted)] hover:text-red-300 hover:bg-red-500/30 text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100"
              title="Remove"
            >
              ×
            </button>

            <div
              onPointerDown={(e) => startDrag("resize", w, e)}
              className="absolute bottom-0.5 right-0.5 w-4 h-4 cursor-se-resize rounded-sm bg-[var(--accent)]/40 hover:bg-[var(--accent)]/70 opacity-0 group-hover:opacity-100"
              title="Resize"
            />
          </div>
        );
      })}
    </div>
  );
}
