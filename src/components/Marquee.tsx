"use client";

import { useLayoutEffect, useRef, useState } from "react";

/** Islet text rule: never truncate if you can scale or scroll. Shrinks down to
 *  `minScale` (50%), and only then scrolls: pause 1.2s, travel at
 *  60 + 0.25*travel px/s, pause, loop. */
export function Marquee({ children, className = "", minScale = 0.5 }: { children: string; className?: string; minScale?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const b = box.current, t = inner.current;
    if (!b || !t) return;
    t.getAnimations().forEach((a) => a.cancel());
    t.style.transform = "none";
    setScale(1);

    const raf = requestAnimationFrame(() => {
      const avail = b.clientWidth;
      const natural = t.scrollWidth;
      if (!avail || natural <= avail) return;
      const sc = Math.max(minScale, avail / natural);
      setScale(sc);
      const travel = natural * sc - avail;
      if (travel <= 1) return;
      const pause = 1200;
      const speed = 60 + 0.25 * travel; // px per second
      const move = (travel / speed) * 1000;
      const total = pause * 2 + move;
      t.animate(
        [
          { transform: "translateX(0)", offset: 0 },
          { transform: "translateX(0)", offset: pause / total },
          { transform: `translateX(-${travel}px)`, offset: (pause + move) / total },
          { transform: `translateX(-${travel}px)`, offset: 1 },
        ],
        { duration: total, iterations: Infinity }
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [children, minScale]);

  return (
    <div ref={box} className={`overflow-hidden whitespace-nowrap ${className}`}>
      <span
        ref={inner}
        className="inline-block origin-left"
        style={{ fontSize: `${scale * 100}%` }}
      >
        {children}
      </span>
    </div>
  );
}
