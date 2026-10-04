"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { RulesEditor } from "@/components/RulesEditor";
import { hasAnyRule } from "@/lib/visibility";
import type { WidgetVisibility } from "@/lib/presets";
import {
  SB_W, SB_H, STANDBY_LABELS, STANDBY_RESIZABLE, defaultScenes, defaultStandByLayout, personalScenes,
  type StandByItem, type StandByItemId, type StandByScene,
} from "@/lib/standby";

function encode(items: StandByItem[]) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(items))));
}

function describe(v: WidgetVisibility | undefined) {
  if (!hasAnyRule(v)) return "no schedule (never auto-selected)";
  const parts: string[] = [];
  if (v?.timeStart && v.timeEnd) parts.push(`${v.timeStart}–${v.timeEnd}`);
  if (v?.days?.length) parts.push(v.days.map((d) => "SMTWTFS"[d]).join(""));
  if (v?.weather) parts.push(v.weather);
  if (v?.calendarKeyword) parts.push(`"${v.calendarKeyword}"`);
  return parts.join(" · ");
}

/** Edit the base StandBy layout and any number of scenes (each switches itself on by
 *  schedule). Toggle items, set per-item rules, and drag/resize over a live preview. */
export function StandByEditor({
  open, onClose, initialLayout, initialScenes, onSave, title = "StandBy layout",
}: {
  title?: string;
  open: boolean;
  onClose: () => void;
  initialLayout: StandByItem[];
  initialScenes: StandByScene[];
  onSave: (layout: StandByItem[], scenes: StandByScene[]) => Promise<void>;
}) {
  const [base, setBase] = useState<StandByItem[]>(initialLayout);
  const [scenes, setScenes] = useState<StandByScene[]>(initialScenes);
  const [editing, setEditing] = useState<string>("base");
  const [selected, setSelected] = useState<StandByItemId | null>(null);
  const [saving, setSaving] = useState(false);

  const scene = scenes.find((s) => s.id === editing) ?? null;
  const items = scene ? scene.items : base;
  const [committed, setCommitted] = useState<StandByItem[]>(items);
  useEffect(() => setCommitted(items), [editing]); // eslint-disable-line react-hooks/exhaustive-deps -- re-sync only when switching scene

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

  function setItems(next: StandByItem[], commit = true) {
    if (scene) setScenes(scenes.map((s) => (s.id === scene.id ? { ...s, items: next } : s)));
    else setBase(next);
    if (commit) setCommitted(next);
  }
  function patch(id: StandByItemId, p: Partial<StandByItem>, commit = false) {
    setItems(items.map((i) => (i.id === id ? { ...i, ...p } : i)), commit);
  }
  function patchScene(p: Partial<StandByScene>) {
    if (!scene) return;
    setScenes(scenes.map((s) => (s.id === scene.id ? { ...s, ...p } : s)));
  }
  function addScene(copy: boolean) {
    const id = `scene-${Date.now().toString(36)}`;
    const src = scene ? scene.items : base;
    const next: StandByScene = {
      id,
      name: copy && scene ? `${scene.name} copy` : "New scene",
      items: src.map((i) => ({ ...i })),
    };
    setScenes([...scenes, next]);
    setEditing(id);
  }
  function removeScene() {
    if (!scene || !window.confirm(`Delete scene "${scene.name}"?`)) return;
    setScenes(scenes.filter((s) => s.id !== scene.id));
    setEditing("base");
  }

  function onDown(e: React.PointerEvent, it: StandByItem, mode: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelected(it.id);
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
      patch(d.id, { w: Math.round(Math.max(120, d.o.w + dx)), h: Math.round(Math.max(40, d.o.h + dy)) });
    }
  }
  function onUp() {
    if (drag.current) setCommitted(items);
    drag.current = null;
  }

  async function save() {
    setSaving(true);
    await onSave(base, scenes);
    setSaving(false);
    onClose();
  }

  const sel = items.find((i) => i.id === selected) ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => {
              if (!window.confirm("Replace this screen's scenes with the personal-screen template (wake up, workday, evening, wind down, full content)?")) return;
              const ps = personalScenes();
              setScenes(ps);
              setEditing(ps[0].id);
              setCommitted(ps[0].items);
            }}
            className="text-xs px-3 py-2 rounded-lg border border-[var(--accent)]/40 text-[var(--accent)]"
          >
            Load personal template
          </button>
          <button
            onClick={() => {
              if (!window.confirm("Reset the base layout and all scenes to the built-in defaults?")) return;
              setBase(defaultStandByLayout());
              setScenes(defaultScenes());
              setEditing("base");
              setCommitted(defaultStandByLayout());
            }}
            className="text-xs px-3 py-2 rounded-lg border border-[var(--surface-border)] text-[var(--muted)]"
          >
            Reset everything to defaults
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg border border-[var(--surface-border)] text-[var(--muted)]">Cancel</button>
            <button onClick={save} disabled={saving} className="text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] disabled:opacity-50">
              {saving ? "Saving…" : "Save all"}
            </button>
          </div>
        </div>
      }
    >
      {/* scene tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[{ id: "base", name: "Default" }, ...scenes].map((s) => (
          <button
            key={s.id}
            onClick={() => { setEditing(s.id); setSelected(null); }}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              editing === s.id
                ? "bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--surface-border)] text-[var(--muted)]"
            }`}
          >
            {s.name}
          </button>
        ))}
        <button onClick={() => addScene(false)} className="text-xs px-3 py-1.5 rounded-full border border-dashed border-[var(--surface-border)] text-[var(--muted)]">+ Scene</button>
        {scene && (
          <>
            <button onClick={() => addScene(true)} className="text-xs px-3 py-1.5 rounded-full border border-[var(--surface-border)] text-[var(--muted)]">Duplicate</button>
            <button onClick={removeScene} className="text-xs px-3 py-1.5 rounded-full border border-red-400/40 text-red-300">Delete</button>
          </>
        )}
      </div>

      {scene ? (
        <div className="mb-4">
          <input
            value={scene.name}
            onChange={(e) => patchScene({ name: e.target.value })}
            className="bg-transparent border border-[var(--surface-border)] rounded px-2 py-1 text-sm mb-1"
          />
          <p className="text-xs text-[var(--muted)]">
            Switches on when: <span className="text-[var(--foreground)]">{describe(scene.schedule)}</span>. The first matching scene
            in the list wins; otherwise the Default layout shows.
          </p>
          <RulesEditor visibility={scene.schedule} onChange={(v) => patchScene({ schedule: v })} />
          <label className="flex items-center gap-2 text-xs text-[var(--muted)] mt-2">
            Dim screen
            <input
              type="range" min={0} max={0.85} step={0.05}
              value={scene.dim ?? 0}
              onChange={(ev) => patchScene({ dim: Number(ev.target.value) || undefined })}
            />
            <span>{Math.round((scene.dim ?? 0) * 100)}%</span>
          </label>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)] mb-4">The Default layout shows whenever no scene&apos;s schedule matches.</p>
      )}

      <div className="flex gap-6 items-start flex-wrap">
        <div className="w-60 shrink-0">
          <ul className="flex flex-col gap-0.5">
            {items.map((it) => (
              <li key={it.id} className={`flex items-center gap-2 rounded px-1 ${selected === it.id ? "bg-white/5" : ""}`}>
                <input type="checkbox" checked={it.enabled} onChange={(e) => patch(it.id, { enabled: e.target.checked }, true)} />
                <button onClick={() => setSelected(it.id)} className={`text-sm text-left flex-1 py-1 ${it.enabled ? "" : "text-[var(--muted)]"}`}>
                  {STANDBY_LABELS[it.id]}
                </button>
                {hasAnyRule(it.visibility) && <span title="has rules" className="text-[10px] text-[var(--accent)]">rule</span>}
              </li>
            ))}
          </ul>
          {sel && (
            <div className="mt-3">
              <div className="text-xs font-medium">{STANDBY_LABELS[sel.id]} — show only when</div>
              <RulesEditor visibility={sel.visibility} onChange={(v) => patch(sel.id, { visibility: v }, true)} />
            </div>
          )}
        </div>

        <div ref={wrap} className="flex-1 min-w-[320px]">
          <p className="text-xs text-[var(--muted)] mb-2">Drag an item to move it; drag the corner to resize. The preview is the real screen (item rules are ignored here).</p>
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
                className={`absolute border border-dashed hover:border-[var(--accent)] hover:bg-white/5 cursor-move touch-none ${selected === it.id ? "border-[var(--accent)]" : "border-white/50"}`}
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
