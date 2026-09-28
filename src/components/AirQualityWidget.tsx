"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface AirQualityData {
  aqi: number;
  label: string;
  pm25: number;
  pm10: number;
}

function aqiColor(aqi: number): string {
  if (aqi <= 50) return "#4ade80";
  if (aqi <= 100) return "#f59e0b";
  if (aqi <= 150) return "#fb923c";
  return "#f87171";
}

export function AirQualityWidget({ size = "md" }: { size?: WidgetSize }) {
  const [data, setData] = useState<AirQualityData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/airquality");
        if (!res.ok) return;
        const json = (await res.json()) as AirQualityData;
        if (!cancelled) setData(json);
      } catch {
        // stay on last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data) return <div className="text-sm text-[var(--muted)]">Loading air quality…</div>;

  if (size === "sm") {
    return (
      <div className="text-5xl font-semibold tabular-nums" style={{ color: aqiColor(data.aqi) }}>
        {data.aqi}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-5xl font-semibold tabular-nums" style={{ color: aqiColor(data.aqi) }}>
        {data.aqi}
      </div>
      <div className="text-sm text-[var(--muted)]">{data.label}</div>
      {size !== "md" && (
        <div className="text-xs text-[var(--muted)] tabular-nums">
          PM2.5 {data.pm25} · PM10 {data.pm10}
        </div>
      )}
    </div>
  );
}
