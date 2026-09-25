import { NextResponse } from "next/server";
import { getFindMyLocations, getFindMyStatus, NeedsLoginError } from "@/lib/icloudSession";

export async function GET() {
  const email = process.env.ICLOUD_EMAIL;
  if (!email) {
    return NextResponse.json({ status: "disconnected", devices: [] });
  }

  try {
    const devices = await getFindMyLocations(email);
    return NextResponse.json({ status: "connected", devices });
  } catch (err) {
    if (err instanceof NeedsLoginError) {
      const status = await getFindMyStatus(email);
      return NextResponse.json({ status, devices: [] });
    }
    console.error("[icloud/findmy]", err);
    return NextResponse.json({ status: "error", error: String(err), devices: [] }, { status: 500 });
  }
}
