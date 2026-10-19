"use client";

import { useEffect, useState } from "react";
import { presenceIdleMs, setPresence } from "@/lib/dormant";

/** Home Assistant dims the tablet's backlight when nobody is in front of it (it starts 5 seconds after the movement stops, steps down
 *  every 3 seconds and turns the screen off at about 20). A backlight at its minimum still shows bright content, so the content has to
 *  dim in step: this returns how much black to lay over the page (0 to 0.93), following the same schedule. Any touch undoes it. */
const DIM_START = 5_000, DIM_END = 20_000, MAX = 0.93;

export const dimFor = (idleMs: number | null): number => {
  if (idleMs == null || idleMs <= DIM_START) return 0;
  return Math.round(Math.min(1, (idleMs - DIM_START) / (DIM_END - DIM_START)) * MAX * 100) / 100;
};

export function usePresenceDim(enabled: boolean, pin: string | null): number {
  const [overlay, setOverlay] = useState(0);
  useEffect(() => {
    if (!enabled || !pin) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastTouch = Date.now();
    const touch = () => { lastTouch = Date.now(); recompute(); };
    const idle = () => {
      const p = presenceIdleMs();
      const t = Date.now() - lastTouch;
      return p == null ? null : Math.min(p, t); // a touch means somebody is there, whatever the sensor says
    };
    const recompute = () => setOverlay((cur) => { const n = dimFor(idle()); return n === cur ? cur : n; });

    async function poll() {
      if (stopped) return;
      if (document.hidden) { timer = setTimeout(poll, 4000); return; } // the screen is off: nothing to ask (it polls again the moment it shows)
      try {
        const res = await fetch("/api/home/presence", { cache: "no-store", headers: { "x-control-pin": pin! } });
        const j = (await res.json()) as { idleMs: number | null };
        setPresence(j.idleMs);
        window.dispatchEvent(new Event("hb-presence")); // lets calm mode and dormancy react at once
      } catch { /* keep the last answer; it goes stale after two minutes */ }
      recompute();
      // quick while something is changing (dimming, or about to), calmer once nobody has been there for a while
      const i = presenceIdleMs();
      const h = new Date().getHours();
      const night = h >= 21 || h < 5;
      const next = i == null ? 15_000 : i < 5_000 ? 4_000 : i < 90_000 ? 2_000 : night ? 20_000 : 10_000;
      timer = setTimeout(poll, next);
    }
    const visible = () => { if (!document.hidden) { if (timer) clearTimeout(timer); poll(); } };
    window.addEventListener("pointerdown", touch, true);
    document.addEventListener("visibilitychange", visible);
    const smooth = setInterval(recompute, 500); // the ramp follows the clock between polls
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(smooth);
      window.removeEventListener("pointerdown", touch, true);
      document.removeEventListener("visibilitychange", visible);
      setPresence(null);
    };
  }, [enabled, pin]);
  return enabled && pin ? overlay : 0;
}
