"use client";

import { useEffect, useState } from "react";

export function NewsWidget() {
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

  return (
    <div className="max-w-xs text-center">
      <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-1">News</div>
      <div className="text-sm">{headlines[index]}</div>
    </div>
  );
}
