"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";
import { useDisplayMode } from "@/lib/useDisplayMode";
import { useFadeSignal } from "@/lib/useFadeSignal";

interface NewsItem {
  title: string;
  imageUrl: string | null;
}

export function NewsWidget({ size = "md" }: { size?: WidgetSize }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const displayMode = useDisplayMode();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/news");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setItems(data.items);
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
    if (!items?.length) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), 8000);
    return () => clearInterval(id);
  }, [items]);

  const visible = useFadeSignal(items?.[index]?.title);

  if (!items?.length) {
    return <div className="text-sm text-[var(--muted)]">Loading news…</div>;
  }

  const current = items[index];
  const showImages = displayMode === "image";
  const fade = `transition-opacity duration-500 ease-out ${visible ? "opacity-100" : "opacity-0"}`;

  // sm: a single rotating headline, no label — too tight for anything else.
  if (size === "sm") {
    return (
      <div className={`w-full text-left ${fade}`}>
        <div className="caps-label !text-[0.5625rem] mb-0.5">News</div>
        <div className="text-base font-semibold leading-snug line-clamp-2">{current.title}</div>
      </div>
    );
  }

  // md: image-mode gets a compact photo card; color mode keeps the plain
  // label + rotating headline.
  if (size === "md") {
    if (showImages && current.imageUrl) {
      return (
        <div className={`relative w-full h-full rounded-[inherit] overflow-hidden ${fade}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- external, frequently-rotating news photo, not worth Next/Image's pipeline */}
          <img src={current.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <div className="text-[9px] uppercase tracking-widest text-white/70 mb-1">News</div>
            <div className="text-sm text-white font-medium line-clamp-2">{current.title}</div>
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-xs text-center">
        <div className="caps-label mb-1">News</div>
        <div className={`text-sm ${fade}`}>{current.title}</div>
      </div>
    );
  }

  // lg / xl: a real headline list — with thumbnails alongside each row in image mode.
  const count = size === "xl" ? 6 : 4;
  return (
    <div className="w-full max-w-lg">
      <div className="caps-label mb-3 text-center">News</div>
      <ul className="flex flex-col gap-2">
        {items.slice(0, count).map((item) => (
          <li
            key={item.title}
            className="flex items-center gap-3 text-sm glass-card !rounded-2xl px-3 py-2 w-full"
          >
            {showImages && item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external, frequently-rotating news photo, not worth Next/Image's pipeline
              <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
            )}
            <span className="line-clamp-2">{item.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
