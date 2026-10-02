"use client";

import { useEffect, useState } from "react";
import type { DisplayMode } from "@/lib/settings";

/** "Color" is the flat/minimal look every widget already had; "image" opts
 * individual widgets into real photos/logos/atmospheric effects where they
 * have something to show — set once for the whole app in Control, not
 * per-widget, since it's a visual mode rather than a per-tile setting. */
export function useDisplayMode(): DisplayMode {
  const [mode, setMode] = useState<DisplayMode>("color");

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/settings", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data) setMode(data.settings.displayMode);
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return mode;
}
