import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings, type DisplayMode } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const patch: Partial<{
    favoriteTeam: string | null;
    commuteOriginLabel: string | null;
    commuteOriginLat: number | null;
    commuteOriginLon: number | null;
    commuteDestLabel: string | null;
    commuteDestLat: number | null;
    commuteDestLon: number | null;
    displayMode: DisplayMode;
  }> = {};

  if (body.favoriteTeam === null || typeof body.favoriteTeam === "string") {
    patch.favoriteTeam = body.favoriteTeam;
  }
  if (body.commuteOriginLabel === null || typeof body.commuteOriginLabel === "string") {
    patch.commuteOriginLabel = body.commuteOriginLabel;
  }
  if (body.commuteOriginLat === null || typeof body.commuteOriginLat === "number") {
    patch.commuteOriginLat = body.commuteOriginLat;
  }
  if (body.commuteOriginLon === null || typeof body.commuteOriginLon === "number") {
    patch.commuteOriginLon = body.commuteOriginLon;
  }
  if (body.commuteDestLabel === null || typeof body.commuteDestLabel === "string") {
    patch.commuteDestLabel = body.commuteDestLabel;
  }
  if (body.commuteDestLat === null || typeof body.commuteDestLat === "number") {
    patch.commuteDestLat = body.commuteDestLat;
  }
  if (body.commuteDestLon === null || typeof body.commuteDestLon === "number") {
    patch.commuteDestLon = body.commuteDestLon;
  }
  if (body.displayMode === "color" || body.displayMode === "image") {
    patch.displayMode = body.displayMode;
  }

  const settings = await updateSettings(patch);
  return NextResponse.json({ settings });
}
