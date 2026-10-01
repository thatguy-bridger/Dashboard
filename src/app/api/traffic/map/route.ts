import { NextRequest, NextResponse } from "next/server";

/** Proxies a TomTom static basemap image so the API key never reaches the client. */
export async function GET(req: NextRequest) {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "TOMTOM_API_KEY is not configured" }, { status: 501 });
  }

  const params = req.nextUrl.searchParams;
  const lat = params.get("lat");
  const lon = params.get("lon");
  const zoom = params.get("zoom") ?? "11";
  const width = params.get("width") ?? "400";
  const height = params.get("height") ?? "300";

  if (!lat || !lon) {
    return NextResponse.json({ error: "lat and lon are required" }, { status: 400 });
  }

  const url = new URL("https://api.tomtom.com/map/1/staticimage");
  url.searchParams.set("key", key);
  url.searchParams.set("layer", "basic");
  url.searchParams.set("style", "night");
  url.searchParams.set("center", `${lon},${lat}`);
  url.searchParams.set("zoom", zoom);
  url.searchParams.set("width", width);
  url.searchParams.set("height", height);

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    return NextResponse.json({ error: "map fetch failed" }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
