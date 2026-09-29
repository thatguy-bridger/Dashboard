import { NextResponse } from "next/server";
import { getSpotifyAuthUrl } from "@/lib/spotify";

export async function GET() {
  return NextResponse.redirect(getSpotifyAuthUrl());
}
