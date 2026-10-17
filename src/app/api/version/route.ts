import { NextResponse } from "next/server";

/** The deployed commit. Kiosk screens compare it to what they loaded and reload when it changes. */
export async function GET() {
  return NextResponse.json({ v: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
