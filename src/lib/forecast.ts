// The full forecast for the weather page, read straight from Open-Meteo (no key). It works without Permuta: the place comes from the server's saved location.
export type Forecast = {
  current: { temp: number; feels: number; code: number; day: boolean; wind: number; gust: number; dir: number; humidity: number; precip: number; uv: number; pressure: number };
  hours: { t: number; temp: number; code: number; day: boolean; pop: number; wind: number; dir: number; precip: number }[];
  days: { date: string; hi: number; lo: number; code: number; pop: number; rain: number; sunrise: number; sunset: number; wind: number }[];
};

export const forecastUrl = (lat: number, lon: number) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,precipitation,surface_pressure&hourly=temperature_2m,weather_code,is_day,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,uv_index&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,precipitation_sum,sunrise,sunset,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=8&past_hours=1`;

type Raw = { current?: Record<string, number>; hourly?: Record<string, number[] | string[]>; daily?: Record<string, (number | string)[]> };

export function parseForecast(j: Raw): Forecast | null {
  const c = j.current, h = j.hourly, d = j.daily;
  if (!c || !h || !d) return null;
  const H = (k: string) => (h[k] ?? []) as number[];
  const D = (k: string) => (d[k] ?? []) as (number | string)[];
  const times = (h.time ?? []) as string[];
  const hours = times.map((t, i) => ({ t: new Date(t).getTime(), temp: H("temperature_2m")[i], code: H("weather_code")[i], day: H("is_day")[i] === 1, pop: H("precipitation_probability")[i] ?? 0, wind: H("wind_speed_10m")[i], dir: H("wind_direction_10m")[i], precip: H("precipitation")[i] ?? 0 }));
  const dates = (D("time") ?? []) as string[];
  const days = dates.map((date, i) => ({ date, hi: D("temperature_2m_max")[i] as number, lo: D("temperature_2m_min")[i] as number, code: D("weather_code")[i] as number, pop: (D("precipitation_probability_max")[i] as number) ?? 0, rain: (D("precipitation_sum")[i] as number) ?? 0, sunrise: new Date(D("sunrise")[i] as string).getTime(), sunset: new Date(D("sunset")[i] as string).getTime(), wind: (D("wind_speed_10m_max")[i] as number) ?? 0 }));
  const uvNow = (h.uv_index as number[] | undefined)?.[Math.max(0, hours.findIndex((x) => x.t > Date.now()) - 1)] ?? 0;
  return { current: { temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, day: c.is_day === 1, wind: c.wind_speed_10m, gust: c.wind_gusts_10m, dir: c.wind_direction_10m, humidity: c.relative_humidity_2m, precip: c.precipitation, uv: uvNow, pressure: c.surface_pressure }, hours, days };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/** One plain sentence about the day: what it will be like and when the weather turns. */
export function dayOutlook(f: Forecast, now: number, text: (code: number) => string): string {
  const next = f.hours.filter((x) => x.t >= now - 3600000 && x.t < now + 24 * 3600000);
  const wet = next.find((x) => x.pop >= 50 || x.precip >= 0.02);
  const today = f.days[0];
  const base = `${text(today.code) || "Fair"}, high ${Math.round(today.hi)}°, low ${Math.round(today.lo)}°`;
  if (wet && wet.t > now) return `${base}. Rain likely from ${new Date(wet.t).toLocaleTimeString([], { hour: "numeric" })}.`;
  if (wet) return `${base}. Wet right now, ${Math.round(wet.pop)}% chance.`;
  const gusty = next.find((x) => x.wind >= 22);
  if (gusty) return `${base}. Windy around ${new Date(gusty.t).toLocaleTimeString([], { hour: "numeric" })}, up to ${Math.round(gusty.wind)} mph.`;
  return `${base}. Dry for the next 24 hours.`;
}
