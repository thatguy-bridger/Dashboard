import { NextResponse } from "next/server";
import { getSpotifyStatus, disconnectSpotify } from "@/lib/spotify";

export async function GET() {
  const status = await getSpotifyStatus();
  return NextResponse.json(status);
}

export async function DELETE() {
  await disconnectSpotify();
  return NextResponse.json({ ok: true });
}
