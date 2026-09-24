"use client";

import { useEffect, useState } from "react";
import { weatherLabel } from "@/lib/weatherCodes";
import type { WidgetSize } from "@/lib/presets";

interface DayForecast {
  date: string;
  highF: number;
  lowF: number;
  weatherCode: number;
}

interface WeatherData {
  tempF: number;
  isDay: boolean;
  weatherCode: number;
  humidity: number;
  windMph: number;
  highF: number;
  lowF: number;
  forecast: DayForecast[];
}

export function WeatherWidget({ size = "md" }: { size?: WidgetSize }) {
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

  // sm: just the number. Nothing else fits.
  if (size === "sm") {
    return <div className="text-5xl font-semibold tabular-nums">{weather.tempF}°</div>;
  }

  // md: temp + condition + hi/lo, the default dense reading.
  if (size === "md") {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="text-5xl font-semibold tabular-nums">{weather.tempF}°</div>
        <div className="text-sm text-[var(--muted)]">{weatherLabel(weather.weatherCode)}</div>
        <div className="text-xs text-[var(--muted)] tabular-nums">
          H {weather.highF}° · L {weather.lowF}°
        </div>
      </div>
    );
  }

  // lg / xl: full detail, plus a short multi-day forecast strip when there's room.
  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="text-7xl font-semibold tabular-nums">{weather.tempF}°</div>
      <div className="text-base text-[var(--muted)]">{weatherLabel(weather.weatherCode)}</div>
      <div className="flex gap-4 text-xs text-[var(--muted)] tabular-nums">
        <span>H {weather.highF}° · L {weather.lowF}°</span>
        <span>Humidity {weather.humidity}%</span>
        <span>Wind {weather.windMph} mph</span>
      </div>
      {size === "xl" && (
        <div className="flex gap-6 mt-2">
          {weather.forecast.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1">
              <div className="text-xs text-[var(--muted)]">
                {new Date(d.date).toLocaleDateString([], { weekday: "short" })}
              </div>
              <div className="text-sm tabular-nums">
                {d.highF}° / {d.lowF}°
              </div>
              <div className="text-[10px] text-[var(--muted)]">{weatherLabel(d.weatherCode)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
