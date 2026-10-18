"use client";

import { useEffect } from "react";
import { setDormant } from "@/lib/dormant";

const MIN = 60_000;

/** Calm mode: saves the tablet's battery (and heat) while nobody is using it. Two levels, switched on the page's root element
 *  and applied by globals.css:
 *   calm      nothing touched for 2 minutes: every animation and transition pauses, drifting text slows right down.
 *   calm-deep nothing touched for 10 minutes, the screen is hidden, or it is night and nothing was touched for 30 seconds:
 *             the frosted-glass blur (the most expensive thing the graphics chip draws here) is off as well.
 *  Separately, after 3 minutes without a touch (or whenever the screen is hidden) the screen is "dormant": nothing polls the
 *  server at all (see lib/dormant.ts). Any touch, or the screen coming back on, brings everything back at once and every
 *  poller catches up immediately. */
export function useCalmMode() {
  useEffect(() => {
    const root = document.documentElement;
    let last = Date.now();
    const apply = () => {
      const idle = Date.now() - last;
      const h = new Date().getHours();
      const night = h >= 21 || h < 5;
      const deep = document.hidden || idle > 10 * MIN || (night && idle > 30_000);
      root.classList.toggle("calm", deep || idle > 2 * MIN);
      root.classList.toggle("calm-deep", deep);
      setDormant(document.hidden || idle > 3 * MIN);
    };
    const touch = () => { last = Date.now(); apply(); };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, touch, { capture: true, passive: true });
    document.addEventListener("visibilitychange", apply);
    const id = setInterval(apply, 15_000);
    apply();
    return () => {
      for (const e of events) window.removeEventListener(e, touch, true);
      document.removeEventListener("visibilitychange", apply);
      clearInterval(id);
      root.classList.remove("calm", "calm-deep");
    };
  }, []);
}
