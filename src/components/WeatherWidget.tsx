"use client";

import { useEffect, useState } from "react";
import { weatherLabel } from "@/lib/weatherCodes";

interface WeatherData {
  tempF: number;
  isDay: boolean;
  weatherCode: number;
  highF: number;
  lowF: number;
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/weather");
        if (!res.ok) return;
        const data = (await res.json()) as WeatherData;
        if (!cancelled) setWeather(data);
      } catch {
        // stay on last known value on transient failure
      }
    }

    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!weather) {
    return <div className="text-sm text-[var(--muted)]">Loading weather…</div>;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-4xl font-semibold tabular-nums">{weather.tempF}°</div>
      <div className="text-sm text-[var(--muted)]">{weatherLabel(weather.weatherCode)}</div>
      <div className="text-xs text-[var(--muted)] tabular-nums">
        H {weather.highF}° · L {weather.lowF}°
      </div>
    </div>
  );
}
