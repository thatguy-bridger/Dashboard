"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

export function NewsWidget({ size = "md" }: { size?: WidgetSize }) {
  const [headlines, setHeadlines] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/news");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setHeadlines(data.headlines);
      } catch {
        // keep last known headlines on a transient failure
      }
    }
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!headlines?.length) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % headlines.length), 8000);
    return () => clearInterval(id);
  }, [headlines]);

  if (!headlines?.length) {
    return <div className="text-sm text-[var(--muted)]">Loading news…</div>;
  }

  // sm: a single rotating headline, no label — too tight for anything else.
  if (size === "sm") {
    return <div className="text-xs text-center line-clamp-3">{headlines[index]}</div>;
  }

  // md: label + one rotating headline (the original behavior).
  if (size === "md") {
    return (
      <div className="max-w-xs text-center">
        <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-1">News</div>
        <div className="text-sm">{headlines[index]}</div>
      </div>
    );
  }

  // lg / xl: a real headline list instead of just one rotating line.
  const count = size === "xl" ? 6 : 4;
  return (
    <div className="w-full max-w-lg">
      <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-3 text-center">News</div>
      <ul className="flex flex-col gap-2">
        {headlines.slice(0, count).map((h) => (
          <li key={h} className="text-sm border-t border-[var(--surface-border)] pt-2 first:border-t-0 first:pt-0">
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}
