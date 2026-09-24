import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const patch: { favoriteTeam?: string | null } = {};
  if (body.favoriteTeam === null || typeof body.favoriteTeam === "string") {
    patch.favoriteTeam = body.favoriteTeam;
  }
  const settings = await updateSettings(patch);
  return NextResponse.json({ settings });
}
