import { NextResponse } from "next/server";
import { getICloudEvents } from "@/lib/icloud";

export async function GET() {
  try {
    const events = await getICloudEvents();
    return NextResponse.json({ ok: true, count: events.length, events: events.slice(0, 20) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
