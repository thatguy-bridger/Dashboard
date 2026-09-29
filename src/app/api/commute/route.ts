import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

interface TomTomRouteResponse {
  routes?: {
    summary: {
      travelTimeInSeconds: number;
      trafficDelayInSeconds: number;
      lengthInMeters: number;
    };
  }[];
}

export async function GET() {
  const apiKey = process.env.TOMTOM_API_KEY;
  const settings = await getSettings();

  const { commuteOriginLat, commuteOriginLon, commuteDestLat, commuteDestLon, commuteOriginLabel, commuteDestLabel } =
    settings;

  if (!apiKey || commuteOriginLat == null || commuteDestLat == null) {
    return NextResponse.json({ status: "not_configured" });
  }

  const url = new URL(
    `https://api.tomtom.com/routing/1/calculateRoute/${commuteOriginLat},${commuteOriginLon}:${commuteDestLat},${commuteDestLon}/json`
  );
  url.searchParams.set("key", apiKey);
  url.searchParams.set("traffic", "true");

  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) {
    return NextResponse.json({ status: "error" }, { status: 502 });
  }
  const data: TomTomRouteResponse = await res.json();
  const summary = data.routes?.[0]?.summary;
  if (!summary) {
    return NextResponse.json({ status: "error" }, { status: 502 });
  }

  return NextResponse.json({
    status: "ok",
    originLabel: commuteOriginLabel,
    destLabel: commuteDestLabel,
    minutes: Math.round(summary.travelTimeInSeconds / 60),
    delayMinutes: Math.round(summary.trafficDelayInSeconds / 60),
    miles: Math.round((summary.lengthInMeters / 1609.34) * 10) / 10,
  });
}
