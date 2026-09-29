"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface Countdown {
  id: string;
  label: string;
  targetDate: number;
  createdAt: number;
}

function daysLeft(targetDate: number): number {
  const ms = targetDate - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Named countdowns to real dates (trips, birthdays, game days), managed
 * from Control — pure client math against dates stored in D1, no external
 * API involved. */
export function CountdownWidget({ size = "md" }: { size?: WidgetSize }) {
  const [countdowns, setCountdowns] = useState<Countdown[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/countdowns", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setCountdowns(json.countdowns);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!countdowns) return <div className="text-sm text-[var(--muted)]">Loading countdowns…</div>;
  if (countdowns.length === 0) {
    return <div className="text-sm text-[var(--muted)]">No countdowns set — add one in Control</div>;
  }

  const upcoming = countdowns.filter((c) => daysLeft(c.targetDate) >= 0);
  const shown = size === "sm" ? upcoming.slice(0, 1) : size === "md" ? upcoming.slice(0, 2) : upcoming.slice(0, 4);

  return (
    <div className="flex flex-col items-center justify-center gap-3 w-full h-full">
      {shown.map((c) => {
        const days = daysLeft(c.targetDate);
        return (
          <div key={c.id} className="flex flex-col items-center gap-0.5">
            <div className="text-4xl font-semibold tabular-nums">
              {days === 0 ? "Today" : days}
              {days > 0 && <span className="text-lg text-[var(--muted)] ml-1">days</span>}
            </div>
            <div className="text-sm text-[var(--muted)]">{c.label}</div>
          </div>
        );
      })}
    </div>
  );
}
