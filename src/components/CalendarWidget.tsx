"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface CalEvent {
  summary: string;
  start: string;
  allDay: boolean;
  source: string;
}

function formatEvent(e: CalEvent) {
  const d = new Date(e.start);
  if (e.allDay) {
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
  return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

export function CalendarWidget({ size = "md" }: { size?: WidgetSize }) {
  const [data, setData] = useState<{ connected: boolean; events: CalEvent[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/calendar");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
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

  if (!data) return <div className="text-sm text-[var(--muted)]">Loading calendar…</div>;
  if (!data.connected) return <div className="text-sm text-[var(--muted)]">No calendar connected</div>;
  if (data.events.length === 0) return <div className="text-sm text-[var(--muted)]">Nothing coming up</div>;

  const count = size === "sm" ? 1 : size === "md" ? 3 : size === "lg" ? 6 : 10;

  return (
    <div className="w-full max-w-lg">
      <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-3 text-center">Calendar</div>
      <ul className="flex flex-col gap-2">
        {data.events.slice(0, count).map((e, i) => (
          <li
            key={i}
            className="flex justify-between gap-3 text-sm border-t border-[var(--surface-border)] pt-2 first:border-t-0 first:pt-0"
          >
            <span className="truncate">{e.summary}</span>
            <span className="text-[var(--muted)] text-xs whitespace-nowrap">{formatEvent(e)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
