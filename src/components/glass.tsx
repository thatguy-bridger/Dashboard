"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { keyframes, restBox, travel, travelMs, type Box } from "@/lib/indicator";

/** ONE shared "liquid glass" indicator behind a set of items. Give each item `data-gi-item`; `active` is the index of the selected one.
 *  When it changes the indicator slides there with a springy ease, stretching along the direction of travel and relaxing at rest, with a faint trailing bleed.
 *  Transform and opacity only (Web Animations API, composited), so it is light enough for a Fire TV. prefers-reduced-motion gets a quick fade instead.
 *  Reusable for any segmented set, horizontal, vertical or wrapping. */
export function GlassGroup({ active, className = "", children }: { active: number | null; className?: string; children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null), ind = useRef<HTMLDivElement>(null), trail = useRef<HTMLDivElement>(null);
  const prev = useRef<Box | null>(null);
  const running = useRef<Animation[]>([]);

  const measure = (): Box | null => {
    const w = wrap.current; if (!w || active == null) return null;
    const el = w.querySelectorAll<HTMLElement>("[data-gi-item]")[active];
    return el ? restBox({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight }) : null;
  };
  const place = (el: HTMLElement, to: Box) => { el.style.width = `${to.width}px`; el.style.height = `${to.height}px`; el.style.transform = `translate3d(${to.left}px, ${to.top}px, 0)`; };

  useLayoutEffect(() => {
    const el = ind.current, tr = trail.current; if (!el || !tr) return;
    const to = measure();
    if (!to) { el.style.opacity = "0"; tr.style.opacity = "0"; prev.current = null; return; }
    el.style.opacity = "1";
    place(el, to); place(tr, to);                                                              // the resting position first; the animation then travels INTO it
    const from = prev.current;
    if (from && (from.left !== to.left || from.top !== to.top)) {
      running.current.forEach((a) => a.cancel());
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        running.current = [el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" })];
      } else {
        const size = Math.max(to.width, to.height), ms = travelMs(travel(from, to), size), kf = keyframes(from, to, size), easing = "cubic-bezier(.34, 1.3, .5, 1)";
        tr.style.opacity = "0.32";
        running.current = [el.animate(kf, { duration: ms, easing }), tr.animate(kf, { duration: ms + 140, delay: 70, easing, fill: "backwards" })];
      }
    } else { tr.style.opacity = "0.32"; }
    prev.current = to;
  }, [active]);   // eslint-disable-line react-hooks/exhaustive-deps

  // a resize re-measures and snaps (no animation)
  useEffect(() => {
    const w = wrap.current; if (!w || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { const to = measure(); if (to && ind.current && trail.current) { place(ind.current, to); place(trail.current, to); prev.current = to; } });
    ro.observe(w);
    return () => ro.disconnect();
  }, [active]);   // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={wrap} className={`glassgroup ${className}`}><div ref={trail} className="gi-trail" aria-hidden /><div ref={ind} className="gi" aria-hidden />{children}</div>;
}
