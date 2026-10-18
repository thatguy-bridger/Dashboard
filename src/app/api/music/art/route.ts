import { NextRequest, NextResponse } from "next/server";
import { haConfigured } from "@/lib/smarthome";
import { speakerPicture } from "@/lib/smarthome/homeAssistant";

/** Cover art for music that comes straight from a speaker (not Spotify): Home Assistant serves it behind its own login, so the
 *  dashboard fetches it for the screens. Only media players' pictures, nothing else from Home Assistant. */
export async function GET(req: NextRequest) {
  const entity = req.nextUrl.searchParams.get("e") ?? "";
  if (!haConfigured() || !/^media_player\.[a-z0-9_]+$/.test(entity)) return new NextResponse(null, { status: 404 });
  const pic = await speakerPicture(entity).catch(() => null);
  if (!pic) return new NextResponse(null, { status: 404 });
  // the `v` in the address changes with every song, so a short cache is safe
  return new NextResponse(pic.body, { headers: { "Content-Type": pic.type, "Cache-Control": "public, max-age=600" } });
}
