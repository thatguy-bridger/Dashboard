import { NextResponse } from "next/server";
import { getSelectedPhotos } from "@/lib/googlePhotos";

export async function GET() {
  const photos = await getSelectedPhotos();
  return NextResponse.json({ photos });
}
