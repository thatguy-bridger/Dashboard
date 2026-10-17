"use client";

import { useEffect } from "react";
import { pollEvery } from "@/lib/poll";

/** A wall screen can sit on one page load for weeks. Every 10 minutes ask which version is deployed and
 *  reload (once) when it isn't the one this page started with, so fixes reach every screen by themselves. */
export function useAutoUpdate() {
  useEffect(() => {
    let first: string | null = null;
    async function check() {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { v } = await r.json();
        if (first === null) first = v;
        else if (v !== first && v !== "dev") window.location.reload();
      } catch {
        // offline: try again next time
      }
    }
    check();
    return pollEvery(check, 10 * 60_000);
  }, []);
}
