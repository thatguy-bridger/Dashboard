"use client";

import { useEffect, useState } from "react";
import { pollEvery } from "@/lib/poll";
import type { Settings } from "@/lib/settings";

// One shared /api/settings poller per page: layout mode, display mode and the StandBy
// layout all read from it instead of each fetching the same endpoint on their own timer.
let latest: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();
let stop: (() => void) | null = null;

async function load() {
  try {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (!res.ok) return;
    latest = (await res.json()).settings as Settings;
    listeners.forEach((fn) => fn(latest!));
  } catch {
    // keep last
  }
}

/** null until the first response. Refreshes every 2 minutes while visible. */
export function useSettings(): Settings | null {
  const [s, setS] = useState<Settings | null>(latest);
  useEffect(() => {
    listeners.add(setS);
    if (latest) setS(latest);
    if (!stop) {
      load();
      stop = pollEvery(load, 2 * 60_000);
    }
    return () => {
      listeners.delete(setS);
      if (listeners.size === 0 && stop) {
        stop();
        stop = null;
      }
    };
  }, []);
  return s;
}
