"use client";

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

/** Design rule: never truncate if you can scale. Text shrinks down to `min` (50%)
 *  of its size to fit `lines` lines in the space it's given; only beyond that does
 *  it clamp with an ellipsis. Re-fits when the text or the box changes size. */
export function FitText({
  children,
  lines = 1,
  min = 0.5,
  className = "",
  style,
}: {
  children: ReactNode;
  lines?: number;
  min?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function fit() {
      const t = inner.current;
      if (!el || !t) return;
      // Scale an inner span (in %) so the caller's own font-size/line-height on the box stay intact.
      const set = (v: number) => (t.style.fontSize = `${v * 100}%`);
      const overflows = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
      set(1);
      if (!overflows()) return;
      let lo = min, hi = 1;
      set(lo);
      if (overflows()) return; // even at the minimum it doesn't fit: stay there and let it clamp
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        set(mid);
        if (overflows()) hi = mid;
        else lo = mid;
      }
      set(lo);
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, lines, min]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        overflow: "hidden",
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
        overflowWrap: "anywhere",
        ...style,
      }}
    >
      <span ref={inner}>{children}</span>
    </div>
  );
}
