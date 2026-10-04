import { cacheHeaders } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";

// UDOT's public traffic API — free key from udottraffic.utah.gov/api. No key
// configured yet just means the widget shows a "not connected" state, same
// pattern as the iCloud/Google integrations.
const DEFAULT_CAMERA_ID = process.env.UDOT_CAMERA_ID ?? "7168";

interface UdotCameraView {
  Url: string;
  Status: string;
}

interface UdotCamera {
  Id: number;
  Roadway: string;
  Direction: string;
  Location: string;
  Views: UdotCameraView[];
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.UDOT_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ status: "disconnected" });
  }

  const { searchParams } = new URL(req.url);
  const cameraId = searchParams.get("cameraId") ?? DEFAULT_CAMERA_ID;

  const url = new URL("https://www.udottraffic.utah.gov/api/v2/get/cameras");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("format", "json");

  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    return NextResponse.json({ status: "error", error: "UDOT fetch failed" }, { status: 502 });
  }

  const cameras = (await res.json()) as UdotCamera[];
  const camera = cameras.find((c) => String(c.Id) === String(cameraId));
  if (!camera) {
    return NextResponse.json({ status: "error", error: "camera not found" }, { status: 404 });
  }

  const view = camera.Views.find((v) => v.Status === "enabled") ?? camera.Views[0];
  if (!view) {
    return NextResponse.json({ status: "error", error: "no camera view available" }, { status: 502 });
  }

  return NextResponse.json({
    status: "connected",
    roadway: camera.Roadway,
    direction: camera.Direction,
    location: camera.Location,
    imageUrl: view.Url,
  }, cacheHeaders(60));
}
