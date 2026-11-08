import type { InfoSource } from "./types.ts";

const WMO: Record<number, string> = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain", 71: "Snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Downpour", 95: "Thunderstorm" };
export const conditionText = (code: number) => WMO[code] ?? "";
const severe = (code: number) => code >= 95 || code === 75 || code === 82 || code === 65;

/** Weather: a pill where the hero doesn't already show it, an alert when it turns severe, and the weather page. */
export const weather: InfoSource = {
  id: "weather",
  items: (c) => {
    const w = c.weather?.current;
    if (!w) return [];
    const night = w.is_day === 0;
    const code = w.weather_code;
    const icon = code === 0 ? (night ? "moon" : "sun") : code <= 2 ? (night ? "cloud" : "cloud-sun") : code === 3 ? "cloud" : code >= 95 ? "bolt" : code >= 71 && code <= 77 ? "snow" : code >= 45 && code <= 48 ? "fog" : "cloud-rain";
    const items = [{ id: "weather", zone: "pill" as const, title: `${Math.round(w.temperature_2m)}° ${conditionText(code)}`.trim(), icon, priority: 40, scenes: ["music" as const, "soon" as const] }];     // only where the hero doesn't already show the weather
    if (severe(code)) items.push({ id: "weather-alert", zone: "pill" as const, title: conditionText(code), icon: "alert", priority: 85, scenes: [] as never[] });
    return items.filter((i) => i.scenes.length || i.id === "weather-alert").map((i) => (i.id === "weather-alert" ? { ...i, scenes: undefined } : i));
  },
  score: (c) => (c.weather?.current && severe(c.weather.current.weather_code) ? 55 : 0),
  page: { id: "weather", title: "Weather", has: (c) => !!c.weather?.current },
};
