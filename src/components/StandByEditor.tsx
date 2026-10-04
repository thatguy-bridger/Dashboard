"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import {
  SB_W, SB_H, STANDBY_LABELS, STANDBY_RESIZABLE, defaultStandByLayout, type StandByItem, type StandByItemId,
} from "@/lib/standby";

function encode(items: StandByItem[]) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(items))));
}

/** Toggle every StandBy item on/off and drag/resize them over a live preview of the real screen. */
export function StandByEditor({
  open, onClose, initial, onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: StandByItem[];
  onSave: (items: StandByItem[]) => Promise<void>;
}) {
  const [items, setItems] = useState<StandByItem[]>(initial);
  const [committed, setCommitted] = useState<StandByItem[]>(initial);
  const [saving, setSaving] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [pw, setPw] = useState(900);
  const S = pw / SB_W;
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPw(Math.max(320, Math.min(1100, el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);
  const drag = useRef<{ id: StandByItemId; mode: "move" | "resize"; sx: number; sy: number; o: StandByItem } | null>(null);

  function update(next: StandByItem[], commit = true) {
    setItems(next);
    if (commit) setCommitted(next);
  }

  function patch(id: StandByItemId, p: Partial<StandByItem>, commit = false) {
    update(items.map((i) => (i.id === id ? { ...i, ...p } : i)), commit);
  }

  function onDown(e: React.PointerEvent, it: StandByItem, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: it.id, mode, sx: e.clientX, sy: e.clientY, o: it };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / S, dy = (e.clientY - d.sy) / S;
    if (d.mode === "move") {
      patch(d.id, {
        x: Math.round(Math.max(0, Math.min(SB_W - 60, d.o.x + dx))),
        y: Math.round(Math.max(0, Math.min(SB_H - 40, d.o.y + dy))),
      });
    } else {
      patch(d.id, { w: Math.round(Math.max(120, d.o.w + dx)), h: Math.round(Math.max(48, d.o.h + dy)) });
    }
  }
  function onUp() {
    if (drag.current) setCommitted(items);
    drag.current = null;
  }

  async function save() {
    setSaving(true);
    await onSave(items);
    setSaving(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="StandBy layout"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => update(defaultStandByLayout())} className="text-xs px-3 py-2 rounded-lg border border-[var(--surface-border)] text-[var(--muted)]">
            Reset to default
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg border border-[var(--surface-border)] text-[var(--muted)]">Cancel</button>
            <button onClick={save} disabled={saving} className="text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] disabled:opacity-50">
              {saving ? "Saving…" : "Save layout"}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex gap-6 items-start flex-wrap">
        <ul className="w-56 shrink-0 flex flex-col gap-1">
          {items.map((it) => (
            <li key={it.id}>
              <label className="flex items-center gap-2 text-sm cursor-pointer py-1">
                <input type="checkbox" checked={it.enabled} onChange={(e) => patch(it.id, { enabled: e.target.checked }, true)} />
                <span className={it.enabled ? "" : "text-[var(--muted)]"}>{STANDBY_LABELS[it.id]}</span>
              </label>
            </li>
          ))}
        </ul>

        <div ref={wrap} className="flex-1 min-w-[320px]">
          <p className="text-xs text-[var(--muted)] mb-2">Drag an item to move it; drag the corner to resize widget-backed items. The preview is the real screen.</p>
          <div
            className="relative overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-black"
            style={{ width: pw, height: SB_H * S }}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <iframe
              title="StandBy preview"
              src={`/screen?layout=standby&sbdraft=${encodeURIComponent(encode(committed))}`}
              className="absolute left-0 top-0 border-0 pointer-events-none"
              style={{ width: SB_W, height: SB_H, transform: `scale(${S})`, transformOrigin: "0 0" }}
            />
            {items.filter((i) => i.enabled).map((it) => (
              <div
                key={it.id}
                onPointerDown={(e) => onDown(e, it, "move")}
                className="absolute border border-dashed border-white/50 hover:border-[var(--accent)] hover:bg-white/5 cursor-move touch-none"
                style={{ left: it.x * S, top: it.y * S, width: it.w * S, height: Math.max(it.h * S, 18), borderRadius: 8 }}
              >
                <span className="absolute -top-4 left-0 text-[10px] text-white/70 whitespace-nowrap">{STANDBY_LABELS[it.id]}</span>
                {STANDBY_RESIZABLE[it.id] && (
                  <div
                    onPointerDown={(e) => onDown(e, it, "resize")}
                    className="absolute -right-1 -bottom-1 w-3 h-3 rounded-full bg-[var(--accent)] cursor-nwse-resize"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
