"use client";

import { useEffect, useState } from "react";
import { weatherLabel } from "@/lib/weatherCodes";
import { weatherGradient, WeatherIcon, WeatherEffect } from "@/lib/weatherVisuals";
import { useDisplayMode } from "@/lib/useDisplayMode";
import type { WidgetSize } from "@/lib/presets";
import { useFadeSignal } from "@/lib/useFadeSignal";

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
  const displayMode = useDisplayMode();

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

  const visible = useFadeSignal(weather ? `${weather.tempF}-${weather.weatherCode}-${weather.hourly[0]?.time}` : null);

  if (!weather) {
    return <div className="text-sm text-[var(--muted)]">Loading weather…</div>;
  }

  const wrap = (node: React.ReactNode) => (
    <div className={`w-full h-full transition-opacity duration-700 ease-out ${visible ? "opacity-100" : "opacity-0"}`}>
      {node}
    </div>
  );

  const [from, to] = weatherGradient(weather.weatherCode, weather.isDay);
  const cardStyle = { background: `radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, ${from} 75%, transparent), transparent 70%), linear-gradient(155deg, color-mix(in srgb, ${from} 45%, transparent), color-mix(in srgb, ${to} 8%, transparent))` };
  const textOnGradient = "text-white";

  // sm: gradient tile, just the number + tiny icon. Nothing else fits.
  if (size === "sm") {
    return wrap(
      <div
        className={`relative flex flex-col items-center justify-center gap-1 w-full h-full rounded-[inherit] overflow-hidden ${textOnGradient}`}
        style={cardStyle}
      >
        {displayMode === "image" && <WeatherEffect code={weather.weatherCode} isDay={weather.isDay} />}
        <WeatherIcon code={weather.weatherCode} isDay={weather.isDay} className="relative w-8 h-8 opacity-90" />
        <div className="relative text-4xl font-semibold tabular-nums">{weather.tempF}°</div>
      </div>
    );
  }

  // md: temp + condition + hi/lo, the default dense reading.
  if (size === "md") {
    return wrap(
      <div
        className={`relative flex flex-col items-center justify-center gap-1 w-full h-full rounded-[inherit] px-3 overflow-hidden ${textOnGradient}`}
        style={cardStyle}
      >
        {displayMode === "image" && <WeatherEffect code={weather.weatherCode} isDay={weather.isDay} />}
        <WeatherIcon code={weather.weatherCode} isDay={weather.isDay} className="relative w-10 h-10 opacity-90" />
        <div className="relative text-5xl font-semibold tabular-nums">{weather.tempF}°</div>
        <div className="relative text-sm opacity-80">{weatherLabel(weather.weatherCode)}</div>
        <div className="relative text-xs opacity-70 tabular-nums">
          H {weather.highF}° · L {weather.lowF}°
        </div>
      </div>
    );
  }

  // lg / xl: full Apple-Weather-style card — big glyph, feels-like, a
  // horizontally scrolling hourly strip, and (xl only) wind/UV/humidity detail tiles.
  return wrap(
    <div
      className={`relative flex flex-col w-full h-full rounded-[inherit] p-4 gap-3 overflow-hidden ${textOnGradient}`}
      style={cardStyle}
    >
      {displayMode === "image" && <WeatherEffect code={weather.weatherCode} isDay={weather.isDay} />}
      <div className="relative flex items-center justify-between">
        <div>
          <div className="text-6xl font-semibold tabular-nums leading-none">{weather.tempF}°</div>
          <div className="text-sm opacity-80 mt-1">{weatherLabel(weather.weatherCode)}</div>
          <div className="text-xs opacity-70 mt-0.5">Feels like {weather.feelsLikeF}°</div>
        </div>
        <WeatherIcon code={weather.weatherCode} isDay={weather.isDay} className="w-20 h-20 opacity-90" />
      </div>

      <div className="relative text-xs opacity-70 tabular-nums">
        H {weather.highF}° · L {weather.lowF}°
      </div>

      {weather.hourly.length > 0 && (
        <div className="relative flex gap-4 overflow-x-hidden pt-2 border-t border-white/15">
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
        <div className="relative grid grid-cols-3 gap-2 mt-auto pt-2 border-t border-white/15">
          <div className="flex flex-col gap-0.5">
            <div className="caps-label !text-[0.5625rem] opacity-80">UV Index</div>
            <div className="text-sm font-medium tabular-nums">{weather.uvIndex}</div>
            <div className="text-[10px] opacity-70">{uvLabel(weather.uvIndex)}</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="caps-label !text-[0.5625rem] opacity-80">Wind</div>
            <div className="text-sm font-medium tabular-nums">{weather.windMph} mph</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="caps-label !text-[0.5625rem] opacity-80">Humidity</div>
            <div className="text-sm font-medium tabular-nums">{weather.humidity}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
