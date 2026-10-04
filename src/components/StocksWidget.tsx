"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";
import { useFadeSignal } from "@/lib/useFadeSignal";

interface Quote {
  symbol: string;
  price: number;
  changePercent: number;
}

function QuoteRow({ q }: { q: Quote }) {
  return (
    <div className="flex items-center justify-between gap-3 w-full">
      <span className="text-base font-bold">{q.symbol}</span>
      <div className="flex items-baseline gap-2">
        <span className="num-rounded text-base font-semibold">{q.price}</span>
        <span className={`num-rounded text-sm font-semibold ${q.changePercent >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {q.changePercent >= 0 ? "+" : ""}
          {q.changePercent}%
        </span>
      </div>
    </div>
  );
}

export function StocksWidget({ size = "md" }: { size?: WidgetSize }) {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [index, setIndex] = useState(0);

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

  // Small tiles cycle one quote at a time instead of squeezing everything in.
  const rotating = size === "sm" || size === "md";
  useEffect(() => {
    if (!rotating || !quotes?.length) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % quotes.length), 6000);
    return () => clearInterval(id);
  }, [rotating, quotes]);

  const current = quotes?.[index % (quotes.length || 1)];
  const visible = useFadeSignal(rotating ? current?.symbol : JSON.stringify(quotes));

  if (!quotes) return <div className="text-sm text-[var(--muted)]">Loading stocks…</div>;
  if (quotes.length === 0) return <div className="text-sm text-[var(--muted)]">No quotes available</div>;

  const fade = `transition-opacity duration-500 ease-out ${visible ? "opacity-100" : "opacity-0"}`;

  if (rotating && current) {
    return (
      <div className={`w-full ${fade}`}>
        <QuoteRow q={current} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 w-full ${fade}`}>
      {quotes.map((q) => (
        <QuoteRow key={q.symbol} q={q} />
      ))}
    </div>
  );
}
