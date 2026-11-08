"use client";
import { useEffect, useRef, useState } from "react";
import { HOLD_MS, holdMoved, holdProgress, inCorner, registerTap } from "@/lib/gesture";

/** The hidden settings trigger. No visible button: press and hold any clock for three seconds (a subtle ring fills while you hold), or tap the
 *  top-left corner five times quickly. Listens on the document so no scene has to know about it, and never blocks the taps it watches. */
export function HiddenTrigger({ onFire }: { onFire: () => void }) {
  const [hold, setHold] = useState<{ cx: number; cy: number; size: number; p: number } | null>(null);
  const fire = useRef(onFire); fire.current = onFire;

  useEffect(() => {
    let taps: number[] = [];
    let start: { t: number; x: number; y: number; cx: number; cy: number; size: number } | null = null;
    let raf = 0, done = false, timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { start = null; done = false; clearTimeout(timer); cancelAnimationFrame(raf); setHold(null); };
    const complete = () => { if (!start || done) return; done = true; const f = fire.current; stop(); f(); };      // the timer, not the animation, decides: reliable even if frames are throttled
    const loop = () => {
      if (!start) return;
      const p = holdProgress(start.t, performance.now());
      if (p >= 1) { complete(); return; }
      setHold({ cx: start.cx, cy: start.cy, size: start.size, p });
      raf = requestAnimationFrame(loop);
    };
    const down = (e: PointerEvent) => {
      if (inCorner(e.clientX, e.clientY, window.innerWidth, window.innerHeight)) {
        const r = registerTap(taps, performance.now()); taps = r.taps;
        if (r.fired) fire.current();
      }
      const clock = (e.target as Element | null)?.closest?.(".clock");
      if (clock) {
        const b = clock.getBoundingClientRect();
        start = { t: performance.now(), x: e.clientX, y: e.clientY, cx: b.left + b.width / 2, cy: b.top + b.height / 2, size: Math.max(b.width, b.height) * 0.62 + 40 };
        done = false; clearTimeout(timer); timer = setTimeout(complete, HOLD_MS); raf = requestAnimationFrame(loop);
      }
    };
    const move = (e: PointerEvent) => { if (start && holdMoved(start.x, start.y, e.clientX, e.clientY)) stop(); };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", stop, true);
    document.addEventListener("pointercancel", stop, true);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", stop, true); document.removeEventListener("pointercancel", stop, true); clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);

  if (!hold) return null;
  const R = 46, C = 2 * Math.PI * R;
  return (
    <div className="holdring" style={{ left: hold.cx - hold.size, top: hold.cy - hold.size, width: hold.size * 2, height: hold.size * 2, opacity: Math.min(1, hold.p * 4) * 0.8 }}>
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r={R} className="hr-track" /><circle cx="50" cy="50" r={R} className="hr-fill" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - hold.p) }} /></svg>
    </div>
  );
}
export { HOLD_MS };
