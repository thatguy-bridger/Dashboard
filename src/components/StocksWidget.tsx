"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface Quote {
  symbol: string;
  price: number;
  changePercent: number;
}

export function StocksWidget({ size = "md" }: { size?: WidgetSize }) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/stocks");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setQuotes(data.quotes);
      } catch {
        // stay on last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!quotes) return <div className="text-sm text-[var(--muted)]">Loading stocks…</div>;
  if (quotes.length === 0) return <div className="text-sm text-[var(--muted)]">No quotes available</div>;

  const shown = size === "sm" ? quotes.slice(0, 1) : size === "md" ? quotes.slice(0, 3) : quotes;

  return (
    <div className="flex flex-col gap-2 w-full">
      {shown.map((q) => (
        <div key={q.symbol} className="flex items-center justify-between gap-3 w-full">
          <span className="text-sm font-medium">{q.symbol}</span>
          <div className="flex items-baseline gap-2">
            <span className="text-sm tabular-nums">{q.price}</span>
            <span
              className={`text-xs tabular-nums ${q.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {q.changePercent >= 0 ? "+" : ""}
              {q.changePercent}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
