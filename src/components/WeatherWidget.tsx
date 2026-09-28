"use client";

import { useEffect, useState } from "react";
import { weatherLabel } from "@/lib/weatherCodes";
import { weatherGradient, WeatherIcon } from "@/lib/weatherVisuals";
import type { WidgetSize } from "@/lib/presets";

interface HourForecast {
  time: string;
  tempF: number;
  weatherCode: number;
  precipProbability: number;
}

interface DayForecast {
  date: string;
  highF: number;
  lowF: number;
  weatherCode: number;
}

interface WeatherData {
  tempF: number;
  feelsLikeF: number;
  isDay: boolean;
  weatherCode: number;
  humidity: number;
  windMph: number;
  windDirection: number;
  uvIndex: number;
  sunrise: string;
  sunset: string;
  highF: number;
  lowF: number;
  hourly: HourForecast[];
  forecast: DayForecast[];
}

function uvLabel(uv: number): string {
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very high";
  return "Extreme";
}

/** Apple Weather's whole visual identity is the gradient card + big glyph —
 * this rebuilds that shape with our own icon set and the dashboard's own
 * glass/blur language, rather than trying to look identical asset-for-asset. */
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

  const [from, to] = weatherGradient(weather.weatherCode, weather.isDay);
  const cardStyle = { background: `linear-gradient(155deg, ${from}, ${to})` };
  const textOnGradient = "text-white";

  // sm: gradient tile, just the number + tiny icon. Nothing else fits.
  if (size === "sm") {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 w-full h-full rounded-[inherit] ${textOnGradient}`}
        style={cardStyle}
      >
        <WeatherIcon code={weather.weatherCode} isDay={weather.isDay} className="w-8 h-8 opacity-90" />
        <div className="text-4xl font-semibold tabular-nums">{weather.tempF}°</div>
      </div>
    );
  }

  // md: temp + condition + hi/lo, the default dense reading.
  if (size === "md") {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 w-full h-full rounded-[inherit] px-3 ${textOnGradient}`}
        style={cardStyle}
      >
        <WeatherIcon code={weather.weatherCode} isDay={weather.isDay} className="w-10 h-10 opacity-90" />
        <div className="text-5xl font-semibold tabular-nums">{weather.tempF}°</div>
        <div className="text-sm opacity-80">{weatherLabel(weather.weatherCode)}</div>
        <div className="text-xs opacity-70 tabular-nums">
          H {weather.highF}° · L {weather.lowF}°
        </div>
      </div>
    );
  }

  // lg / xl: full Apple-Weather-style card — big glyph, feels-like, a
  // horizontally scrolling hourly strip, and (xl only) wind/UV/humidity detail tiles.
  return (
    <div className={`flex flex-col w-full h-full rounded-[inherit] p-4 gap-3 ${textOnGradient}`} style={cardStyle}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-6xl font-semibold tabular-nums leading-none">{weather.tempF}°</div>
          <div className="text-sm opacity-80 mt-1">{weatherLabel(weather.weatherCode)}</div>
          <div className="text-xs opacity-70 mt-0.5">Feels like {weather.feelsLikeF}°</div>
        </div>
        <WeatherIcon code={weather.weatherCode} isDay={weather.isDay} className="w-20 h-20 opacity-90" />
      </div>

      <div className="text-xs opacity-70 tabular-nums">
        H {weather.highF}° · L {weather.lowF}°
      </div>

      {weather.hourly.length > 0 && (
        <div className="flex gap-4 overflow-x-hidden pt-2 border-t border-white/15">
          {weather.hourly.slice(0, size === "xl" ? 8 : 5).map((h) => (
            <div key={h.time} className="flex flex-col items-center gap-1 shrink-0">
              <div className="text-[10px] opacity-70">
                {new Date(h.time).toLocaleTimeString([], { hour: "numeric" })}
              </div>
              <WeatherIcon code={h.weatherCode} isDay={weather.isDay} className="w-5 h-5 opacity-90" />
              <div className="text-xs font-medium tabular-nums">{h.tempF}°</div>
            </div>
          ))}
        </div>
      )}

      {size === "xl" && (
        <div className="grid grid-cols-3 gap-2 mt-auto pt-2 border-t border-white/15">
          <div className="flex flex-col gap-0.5">
            <div className="text-[9px] uppercase tracking-widest opacity-60">UV Index</div>
            <div className="text-sm font-medium tabular-nums">{weather.uvIndex}</div>
            <div className="text-[10px] opacity-70">{uvLabel(weather.uvIndex)}</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-[9px] uppercase tracking-widest opacity-60">Wind</div>
            <div className="text-sm font-medium tabular-nums">{weather.windMph} mph</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-[9px] uppercase tracking-widest opacity-60">Humidity</div>
            <div className="text-sm font-medium tabular-nums">{weather.humidity}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
