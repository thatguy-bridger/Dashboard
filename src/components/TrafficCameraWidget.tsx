"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface CameraData {
  status: "connected" | "disconnected" | "error";
  roadway?: string;
  direction?: string;
  location?: string;
  imageUrl?: string;
}

/** UDOT camera snapshots are static images at a fixed URL — the image itself
 * updates on UDOT's end every minute or so, so a cache-busting query param
 * is required to actually see the refresh instead of a browser-cached copy. */
export function TrafficCameraWidget({ size = "md" }: { size?: WidgetSize }) {
  const [data, setData] = useState<CameraData | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/udot", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 2 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!data) return <div className="text-sm text-[var(--muted)]">Loading traffic camera…</div>;
  if (data.status === "disconnected") {
    return <div className="text-sm text-[var(--muted)]">UDOT camera not connected — add UDOT_API_KEY</div>;
  }
  if (data.status === "error" || !data.imageUrl) {
    return <div className="text-sm text-[var(--muted)]">Camera unavailable</div>;
  }

  const src = `${data.imageUrl}${data.imageUrl.includes("?") ? "&" : "?"}t=${tick}`;

  return (
    <div className="relative w-full h-full overflow-hidden rounded-[inherit]">
      {/* eslint-disable-next-line @next/next/no-img-element -- external, frequently-refreshed snapshot, not worth Next/Image's optimization pipeline */}
      <img src={src} alt={data.location ?? "Traffic camera"} className="w-full h-full object-cover" />
      {size !== "sm" && (
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm">
          <div className="text-[11px] text-white font-medium">
            {data.roadway} {data.direction}
          </div>
          {size !== "md" && data.location && (
            <div className="text-[9px] text-white/70">{data.location}</div>
          )}
        </div>
      )}
    </div>
  );
}
