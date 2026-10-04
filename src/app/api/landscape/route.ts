import { NextRequest, NextResponse } from "next/server";
import { LANDSCAPE_SOURCES } from "@/lib/landscapes";

/** Same-origin proxy for the StandBy landscape photos: Wikimedia's redirect
 *  carries no CORS headers, so the browser couldn't blur them client-side.
 *  Cached hard at the edge — six small images, fetched about once a day. */
export async function GET(req: NextRequest) {
  const i = Number(req.nextUrl.searchParams.get("i"));
  const src = LANDSCAPE_SOURCES[i];
  if (!src) return new NextResponse("not found", { status: 404 });
  const res = await fetch(src, { headers: { "User-Agent": "HomeBaseDashboard/1.0" } });
  if (!res.ok) return new NextResponse("upstream failed", { status: 502 });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}
