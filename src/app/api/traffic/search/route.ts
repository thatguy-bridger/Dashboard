import { NextRequest, NextResponse } from "next/server";
import { cacheHeaders } from "@/lib/http";

/** Address/place search for the Commute picker: up to 6 candidates to choose from. */
export async function GET(req: NextRequest) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return NextResponse.json({ error: "TOMTOM_API_KEY is not configured" }, { status: 501 });
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) return NextResponse.json({ results: [] });

  const url = new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(q)}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("limit", "6");
  url.searchParams.set("typeahead", "true");
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return NextResponse.json({ error: "search failed" }, { status: 502 });
  const data = await res.json();
  const results = (data.results ?? []).map((r: { address?: { freeformAddress?: string }; poi?: { name?: string }; position: { lat: number; lon: number } }) => ({
    label: [r.poi?.name, r.address?.freeformAddress].filter(Boolean).join(" — ") || q,
    lat: r.position.lat,
    lon: r.position.lon,
  }));
  return NextResponse.json({ results }, cacheHeaders(3600));
}
