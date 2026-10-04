"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** Islet "drifting rows": cosine ping-pong (eases to a stop at each end),
 *  ~32px/s, at least 18s per sweep, starts 2.5s in, 30fps. Static when the
 *  content fits. Returns the current x offset and whether it overflows. */
export function useDrift(box: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  const [x, setX] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    startRef.current = null;
    function frame(ts: number) {
      raf = requestAnimationFrame(frame);
      if (ts - last < 33) return;
      last = ts;
      const b = box.current, c = content.current;
      if (!b || !c) return;
      const travel = c.scrollWidth - b.clientWidth;
      if (travel <= 4) {
        setOverflow(false);
        setX(0);
        return;
      }
      setOverflow(true);
      if (startRef.current === null) startRef.current = ts + 2500;
      const t = ts - startRef.current;
      if (t < 0 || document.hidden) return;
      const sweep = Math.max(18, travel / 32) * 1000;
      const phase = (t % (sweep * 2)) / sweep; // 0..2
      const p = (1 - Math.cos(Math.PI * phase)) / 2; // 0->1->0 easing at ends
      setX(-travel * p);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-provided deps
  }, deps);

  return { x, overflow };
}
