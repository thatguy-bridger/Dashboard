import { NextRequest, NextResponse } from "next/server";

// Same default placeholder location as /api/weather until per-device
// location is configurable.
const DEFAULT_LAT = 40.7128;
const DEFAULT_LON = -74.006;

function aqiLabel(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy (sensitive)";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat") ?? String(DEFAULT_LAT);
  const lon = searchParams.get("lon") ?? String(DEFAULT_LON);

  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", lat);
  url.searchParams.set("longitude", lon);
  url.searchParams.set("current", "pm2_5,pm10,us_aqi");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) {
    return NextResponse.json({ error: "air quality fetch failed" }, { status: 502 });
  }
  const data = await res.json();

  const aqi = Math.round(data.current.us_aqi);

  return NextResponse.json({
    aqi,
    label: aqiLabel(aqi),
    pm25: Math.round(data.current.pm2_5 * 10) / 10,
    pm10: Math.round(data.current.pm10 * 10) / 10,
  });
}
