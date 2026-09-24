import { NextResponse } from "next/server";
import { discoverCalendars } from "@/lib/icloud";

export async function GET() {
  try {
    const { baseUrl, calendars } = await discoverCalendars();
    return NextResponse.json({ ok: true, baseUrl, calendars });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
