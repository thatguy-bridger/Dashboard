"use client";

import { useEffect, useRef, useState } from "react";

// cubic-bezier(0.3, 0, 0.2, 1), solved by bisection
function bezier(x1: number, y1: number, x2: number, y2: number, t: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  let lo = 0, hi = 1, s = t;
  for (let i = 0; i < 24; i++) {
    const x = ((ax * s + bx) * s + cx) * s;
    if (x < t) lo = s; else hi = s;
    s = (lo + hi) / 2;
  }
  return ((ay * s + by) * s + cy) * s;
}

/** StandBy open: a circle grows from the notch position (top centre) until it
 *  covers the screen. Its edge wobbles (two sine lobes, 7 and 11, amplitude
 *  ~2.8% of radius, peaking mid-flight) and two thin accent rings race ahead.
 *  1.6s timingCurve(0.3, 0, 0.2, 1). */
export function RippleReveal({ children, accent = "#f0b38a", duration = 1600 }: { children: React.ReactNode; accent?: string; duration?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  const [p, setP] = useState(0);

  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    function frame(now: number) {
      const t = Math.min(1, (now - t0) / duration);
      const e = bezier(0.3, 0, 0.2, 1, t);
      setP(e);
      const el = ref.current;
      if (el) {
        const w = el.clientWidth, h = el.clientHeight;
        const cx = w / 2, cy = 0;
        const rMax = Math.hypot(w / 2, h) * 1.08;
        const r = rMax * e;
        const amp = 0.028 * Math.sin(Math.PI * e);
        const pts: string[] = [];
        for (let i = 0; i < 96; i++) {
          const th = (i / 96) * Math.PI * 2;
          const rr = r * (1 + amp * (Math.sin(7 * th + e * 9) + Math.sin(11 * th - e * 12)));
          pts.push(`${cx + rr * Math.cos(th)}px ${cy + rr * Math.sin(th)}px`);
        }
        el.style.clipPath = `polygon(${pts.join(",")})`;
      }
      if (t < 1) raf = requestAnimationFrame(frame);
      else {
        if (el) el.style.clipPath = "none";
        setDone(true);
      }
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  const ringOpacity = Math.sin(Math.PI * p);
  return (
    <>
      <div ref={ref} className="fixed inset-0">
        {children}
      </div>
      {!done && (
        <svg className="fixed inset-0 w-full h-full pointer-events-none" style={{ opacity: ringOpacity }}>
          {[1.06, 1.14].map((k, i) => (
            <circle
              key={i}
              cx="50%"
              cy="0"
              r={Math.hypot(window.innerWidth / 2, window.innerHeight) * 1.08 * Math.min(1, p * k)}
              fill="none"
              stroke={accent}
              strokeOpacity={i === 0 ? 0.6 : 0.3}
              strokeWidth="1.5"
            />
          ))}
        </svg>
      )}
    </>
  );
}
