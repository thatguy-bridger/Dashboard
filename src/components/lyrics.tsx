"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fitFontSize } from "@/lib/fit";
import { lineLook, scrollShift, type LyricView } from "@/lib/lyrics";
import { Icon } from "./Icon";

/** The lyrics for the Music scene, the way Apple Music shows them: every line sits in one long column that scrolls so the line being sung is in the middle.
 *  That line is the biggest and brightest; the lines around it are smaller, dimmer and a little blurred, and as the song moves on each line grows and brightens as it
 *  arrives and recedes as it leaves while the whole column glides up. A line that wraps to several lines simply takes more room and pushes the rest along. */
export function LyricsBlock({ view }: { view: LyricView }) {
  const box = useRef<HTMLDivElement>(null);
  const col = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<number, HTMLDivElement>());
  const [shift, setShift] = useState(0);
  const [h, setH] = useState(0);

  // the column's position: centre the line being sung (before the first line, centre the first one a little lower, as "coming up")
  useLayoutEffect(() => {
    const el = refs.current.get(Math.max(0, view.index));
    if (!el || !h) return;
    setShift(scrollShift(h, el.offsetTop, el.offsetHeight) + (view.index < 0 ? el.offsetHeight * 0.9 : 0));
  }, [view.index, view.lines.length, h]);
  useLayoutEffect(() => {
    const b = box.current;
    if (!b) return;
    const measure = () => setH(b.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    if (col.current) ro.observe(col.current);        // a line wrapping differently changes the column's height: centre again
    return () => ro.disconnect();
  }, []);

  return (
    <div className="lyrics lscroll" aria-live="off" ref={box}>
      <div className="lcol" ref={col} style={{ transform: `translateY(${shift}px)` }}>
        {view.lines.map((l) => {
          const d = l.i - view.index;
          const look = lineLook(d);
          return (
            <div
              key={l.i}
              ref={(el) => { if (el) refs.current.set(l.i, el); else refs.current.delete(l.i); }}
              className={`lln ${d === 0 ? "now" : d < 0 ? "past" : "next"} ${l.instrumental ? "instr" : ""}`}
              style={{ transform: `scale(${look.scale})`, opacity: look.opacity, filter: look.blur ? `blur(${look.blur}px)` : "none" }}
            >{l.instrumental ? "\u266a" : l.text}</div>
          );
        })}
      </div>
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
