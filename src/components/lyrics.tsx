"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fitFontSize } from "@/lib/fit";
import { lyricOpacity, stageLayout, type LyricView } from "@/lib/lyrics";
import { useLayers } from "@/lib/useLayers";
import { Icon } from "./Icon";

/** The lyrics for the Music scene: the line being sung stays big in the middle and soft-fades to the next as the song moves on. The lines coming up fade in below it,
 *  and the lines already sung drift up and fade away slowly. A box too short for neighbours shows just the current line, as before. */
export function LyricsBlock({ view }: { view: LyricView }) {
  const texts = useRef(new Map<string, { text: string; instrumental: boolean }>());
  const key = String(view.index);
  texts.current.set(key, { text: view.current, instrumental: view.instrumental || view.index < 0 });
  if (texts.current.size > 8) { const first = texts.current.keys().next().value; if (first !== undefined && first !== key) texts.current.delete(first); }
  const layers = useLayers(key, 1150);

  const box = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState({ h: 0, size: 0, cur: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const line = el.querySelector(".lyricline");
      const size = line ? parseFloat(getComputedStyle(line).fontSize) || 0 : 0;
      // the line being sung (the newest layer): its real height, one line or several
      const live = el.querySelectorAll(".lyricline:not(.leaving) .fit-text");
      const cur = live.length ? (live[live.length - 1] as HTMLElement).offsetHeight : size * 1.15;
      setGeo((g) => (Math.abs(g.h - el.clientHeight) > 1 || Math.abs(g.size - size) > 0.5 || Math.abs(g.cur - cur) > 1 ? { h: el.clientHeight, size, cur } : g));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll(".fit-text").forEach((t) => ro.observe(t));
    return () => ro.disconnect();
  }, [layers.length, key]);
  const stage = geo.h > 0 && geo.size > 0 ? stageLayout(geo.h, geo.size, geo.cur) : null;

  return (
    <div className="lyrics" aria-live="off" ref={box}>
      {layers.map((l) => {
        const t = texts.current.get(l.key) ?? { text: "", instrumental: true };
        return (
          <div key={l.id} className={`lyricline ${l.leaving ? "leaving" : ""} ${t.instrumental ? "instr" : ""}`}>
            <div className="lcore">{t.instrumental ? <Icon name="note" /> : <FitText text={t.text} />}</div>
          </div>
        );
      })}
      {stage && view.lines.filter((l) => l.offset !== 0 && Math.abs(l.offset) <= 3 && !l.instrumental && stage.visible(l.offset)).map((l) => (
        <div
          key={l.i}
          className={`lnb ${l.offset < 0 ? "past" : "next"}`}
          style={{ top: stage.y(l.offset), fontSize: stage.n, opacity: lyricOpacity(l.offset) * stage.calm, filter: `blur(${(Math.abs(l.offset) > 1 ? Math.abs(l.offset) - 0.4 : 0) + (1 - stage.calm) * 2.2}px)` }}
        >{l.text}</div>
      ))}
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

/** A slim scrolling lyric line in the header, under the island; long lines glide sideways so they can be read in full. */
export function LyricBar({ view }: { view: LyricView | null }) {
  const box = useRef<HTMLDivElement>(null), txt = useRef<HTMLSpanElement>(null);
  const line = view && view.index >= 0 && !view.instrumental ? view.current : "";
  useLayoutEffect(() => {
    const b = box.current, t = txt.current; if (!b || !t) return;
    const over = t.scrollWidth - b.clientWidth;
    t.style.setProperty("--shift", over > 2 ? `${-over}px` : "0px");
    t.classList.toggle("glide", over > 2);
  }, [line]);
  if (!line) return null;
  return <div className="lyricbar" ref={box} key={view!.index}><span ref={txt}>{line}</span></div>;
}
