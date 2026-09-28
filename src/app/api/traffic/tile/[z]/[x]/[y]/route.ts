import { NextResponse } from "next/server";

// Proxies TomTom's traffic-flow tiles so the API key never reaches the
// browser — MapLibre loads tile URLs directly client-side, and a raw
// TomTom URL with ?key=... embedded would expose it in plain sight.
export async function GET(_req: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TomTom not configured" }, { status: 404 });
  }

  const { z, x, y } = await params;
  const yFile = y.replace(/\.png$/, "");
  const url = `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${yFile}.png?key=${apiKey}`;

  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) {
    return NextResponse.json({ error: "tile fetch failed" }, { status: 502 });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=120",
    },
  });
}
