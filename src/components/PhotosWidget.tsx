"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface PhotoItem {
  id: string;
  url: string;
}

/** Slideshow of photos picked once via Google's Photos Picker (see the
 * Control page) — Google no longer lets third-party apps browse a whole
 * library, so there's no "recent photos" feed, just what was hand-picked. */
export function PhotosWidget({ size = "md" }: { size?: WidgetSize }) {
  const [photos, setPhotos] = useState<PhotoItem[] | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/photos", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setPhotos(json.photos);
      } catch {
        // keep showing the last known photos on a transient failure
      }
    }
    load();
    const id = setInterval(load, 45 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!photos?.length) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), 15000);
    return () => clearInterval(id);
  }, [photos]);

  if (!photos) return <div className="text-sm text-[var(--muted)]">Loading photos…</div>;
  if (photos.length === 0) {
    return <div className="text-sm text-[var(--muted)]">No photos picked yet — pick some in Control</div>;
  }

  const heightClass = size === "sm" ? "h-24" : size === "md" ? "h-40" : size === "lg" ? "h-64" : "h-80";

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, expiring Google URL; next/image can't cache it usefully
    <img
      src={photos[index % photos.length].url}
      alt=""
      className={`${heightClass} w-full max-w-lg object-cover rounded-xl`}
    />
  );
}
