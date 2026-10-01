import { NextRequest, NextResponse } from "next/server";

/** Looks up a free-text place name via TomTom Fuzzy Search and returns its best match. */
export async function GET(req: NextRequest) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "TOMTOM_API_KEY is not configured" }, { status: 501 });
  }

  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }

  const url = new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("limit", "1");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ error: "geocode lookup failed" }, { status: 502 });
  }
  const data = await res.json();
  const top = data.results?.[0];
  if (!top) {
    return NextResponse.json({ error: "no match" }, { status: 404 });
  }

  return NextResponse.json({
    label: top.address?.freeformAddress ?? top.poi?.name ?? query,
    lat: top.position.lat,
    lon: top.position.lon,
  });
}
