"use client";

import { useEffect, useState } from "react";
import type { LayoutMode } from "@/lib/settings";

/** null until the first load, so screens don't flash the wrong layout. */
export function useLayoutMode(): LayoutMode | null {
  const [mode, setMode] = useState<LayoutMode | null>(null);
  useEffect(() => {
    let off = false;
    function load() {
      fetch("/api/settings", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!off && d) setMode(d.settings.layoutMode ?? "standby");
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      off = true;
      clearInterval(id);
    };
  }, []);
  return mode;
}
