import { cacheHeaders } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";
import { getFindMyLocations, getFindMyStatus, NeedsLoginError } from "@/lib/icloudSession";

export async function GET(req: NextRequest) {
  const email = process.env.ICLOUD_EMAIL;
  if (!email) {
    return NextResponse.json({ status: "disconnected", devices: [], noLocation: [] });
  }

  // Control's connection badge only needs the stored state. A live Find My refresh just to
  // render a badge made every transient Apple hiccup look like a lost login.
  if (req.nextUrl.searchParams.get("status") === "1") {
    return NextResponse.json({ status: await getFindMyStatus(email) });
  }

  try {
    const { devices, noLocation } = await getFindMyLocations(email);
    return NextResponse.json({ status: "connected", devices, noLocation }, cacheHeaders(120));
  } catch (err) {
    if (err instanceof NeedsLoginError) {
      const status = await getFindMyStatus(email);
      return NextResponse.json({ status, devices: [], noLocation: [] });
    }
    console.error("[icloud/findmy]", err);
    return NextResponse.json({ status: "error", error: String(err), devices: [], noLocation: [] }, { status: 500 });
  }
}
