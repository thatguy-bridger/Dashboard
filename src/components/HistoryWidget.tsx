"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface WikiEvent {
  text: string;
  year: number;
}

/** Rotates through today's "on this day" events (Wikimedia's feed), one at
 * a time — same ambient, glance-and-move-on shape as the News ticker. */
export function HistoryWidget({ size = "md" }: { size?: WidgetSize }) {
  const [events, setEvents] = useState<WikiEvent[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/history")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setEvents(data.events);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!events || events.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % events.length), 15 * 1000);
    return () => clearInterval(id);
  }, [events]);

  if (!events || events.length === 0) {
    return <div className="text-sm text-[var(--muted)]">Loading history…</div>;
  }

  const current = events[index];
  const lineClamp = size === "sm" ? "line-clamp-3" : size === "md" ? "line-clamp-4" : "line-clamp-6";

  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center px-2 w-full h-full">
      <div className="text-xs text-[var(--muted)] uppercase tracking-widest">{current.year}</div>
      <p className={`text-sm ${lineClamp}`}>{current.text}</p>
    </div>
  );
}
