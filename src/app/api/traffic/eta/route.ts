import { NextRequest, NextResponse } from "next/server";

/**
 * Live drive-time estimate between two points via TomTom Routing, with
 * `traffic=true` so the returned time reflects current conditions — this is
 * where "live traffic" actually comes from, rather than a static overlay
 * image (TomTom's Static Image API doesn't composite a traffic layer; the
 * map widget shows the basemap and this delay/ETA alongside it).
 */
export async function GET(req: NextRequest) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "TOMTOM_API_KEY is not configured" }, { status: 501 });
  }

  const params = req.nextUrl.searchParams;
  const originLat = params.get("originLat");
  const originLon = params.get("originLon");
  const destLat = params.get("destLat");
  const destLon = params.get("destLon");

  if (!originLat || !originLon || !destLat || !destLon) {
    return NextResponse.json({ error: "originLat, originLon, destLat, destLon are required" }, { status: 400 });
  }

  const url = new URL(
    `https://api.tomtom.com/routing/1/calculateRoute/${originLat},${originLon}:${destLat},${destLon}/json`
  );
  url.searchParams.set("key", key);
  url.searchParams.set("traffic", "true");
  url.searchParams.set("travelMode", "car");

  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) {
    return NextResponse.json({ error: "route lookup failed" }, { status: 502 });
  }
  const data = await res.json();
  const summary = data.routes?.[0]?.summary;
  if (!summary) {
    return NextResponse.json({ error: "no route found" }, { status: 404 });
  }

  const travelTimeSec: number = summary.travelTimeInSeconds;
  const delaySec: number = summary.trafficDelayInSeconds ?? 0;

  return NextResponse.json({
    travelTimeMin: Math.round(travelTimeSec / 60),
    delayMin: Math.round(delaySec / 60),
    distanceMiles: Math.round((summary.lengthInMeters / 1609.34) * 10) / 10,
  });
}
