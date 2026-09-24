import { NextRequest, NextResponse } from "next/server";

// Placeholder default location (New York City) until per-device location is
// configurable from the controller (Phase 4).
const DEFAULT_LAT = 40.7128;
const DEFAULT_LON = -74.006;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat") ?? String(DEFAULT_LAT);
  const lon = searchParams.get("lon") ?? String(DEFAULT_LON);

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("current", "temperature_2m,weather_code,is_day");
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) {
    return NextResponse.json({ error: "weather fetch failed" }, { status: 502 });
  }
  const data = await res.json();

  return NextResponse.json({
    tempF: Math.round(data.current.temperature_2m),
    isDay: Boolean(data.current.is_day),
    weatherCode: data.current.weather_code,
    highF: Math.round(data.daily.temperature_2m_max[0]),
    lowF: Math.round(data.daily.temperature_2m_min[0]),
  });
}
