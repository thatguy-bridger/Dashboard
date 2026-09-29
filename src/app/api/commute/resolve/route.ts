import { NextRequest, NextResponse } from "next/server";
import { updateSettings } from "@/lib/settings";

interface TomTomGeocodeResult {
  address: { freeformAddress: string };
  position: { lat: number; lon: number };
}

async function geocode(query: string, apiKey: string): Promise<TomTomGeocodeResult | null> {
  const url = new URL(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("limit", "1");

  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0] ?? null;
}

// Resolves a typed home/work address into lat/lon once, via TomTom's search
// API — stored after that, so the commute widget itself never re-geocodes.
export async function POST(req: NextRequest) {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TomTom not configured" }, { status: 400 });
  }

  const body = await req.json();
  if (typeof body.originAddress !== "string" || typeof body.destAddress !== "string") {
    return NextResponse.json({ error: "originAddress and destAddress are required" }, { status: 400 });
  }

  const [origin, dest] = await Promise.all([
    geocode(body.originAddress, apiKey),
    geocode(body.destAddress, apiKey),
  ]);
  if (!origin || !dest) {
    return NextResponse.json({ error: "could not resolve one or both addresses" }, { status: 422 });
  }

  const settings = await updateSettings({
    commuteOriginLabel: origin.address.freeformAddress,
    commuteOriginLat: origin.position.lat,
    commuteOriginLon: origin.position.lon,
    commuteDestLabel: dest.address.freeformAddress,
    commuteDestLat: dest.position.lat,
    commuteDestLon: dest.position.lon,
  });

  return NextResponse.json({ settings });
}
