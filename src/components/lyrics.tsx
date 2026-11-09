"use client";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { fitFontSize } from "@/lib/fit";
import type { LyricView } from "@/lib/lyrics";
import { useLayers } from "@/lib/useLayers";
import { Icon } from "./Icon";

/** The lyrics for the Music scene: ONE large current line that replaces itself with a soft cross-fade as the song moves on (like the old dashboard). */
export function LyricsBlock({ view }: { view: LyricView }) {
  const texts = useRef(new Map<string, { text: string; instrumental: boolean }>());
  const key = String(view.index);
  texts.current.set(key, { text: view.current, instrumental: view.instrumental || view.index < 0 });
  if (texts.current.size > 8) { const first = texts.current.keys().next().value; if (first !== undefined && first !== key) texts.current.delete(first); }
  const layers = useLayers(key, 900);
  return (
    <div className="lyrics" aria-live="off">
      {layers.map((l) => {
        const t = texts.current.get(l.key) ?? { text: "", instrumental: true };
        return <div key={l.id} className={`lyricline ${l.leaving ? "leaving" : ""} ${t.instrumental ? "instr" : ""}`}>{t.instrumental ? <Icon name="note" /> : <FitText text={t.text} />}</div>;
      })}
    </div>
  );
}

/** A one-line ticker for scenes that aren't about the music. */
export function LyricTicker({ view }: { view: LyricView | null }) {
  if (!view || view.index < 0) return null;
  return <div className="ticker" key={view.index}>{view.instrumental ? <Icon name="note" /> : <FitText text={view.current} single />}</div>;
}


/** Text that always shows in full: it shrinks (as far as it takes) to fit the box it sits in, and grows back to its normal size when there's room. */
export function FitText({ text, single = false }: { text: string; single?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fit = useCallback(() => {
    const el = ref.current, box = el?.parentElement;
    if (!el || !box) return;
    el.style.fontSize = "";
    const base = parseFloat(getComputedStyle(el).fontSize) || 16;
    const size = fitFontSize(base, (sz) => { el.style.fontSize = `${sz}px`; return { w: el.scrollWidth, h: el.scrollHeight }; }, { w: box.clientWidth, h: single ? Infinity : box.clientHeight });
    el.style.fontSize = size < base ? `${size}px` : "";
  }, [single]);
  useLayoutEffect(() => { fit(); }, [text, fit]);
  useEffect(() => {
    const box = ref.current?.parentElement;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(box);
    return () => ro.disconnect();
  }, [fit]);
  return <span ref={ref} className={`fit-text ${single ? "one" : ""}`}>{text}</span>;
}
