import { NextRequest, NextResponse } from "next/server";
import { getHiddenCalendars, getMacCalendar, setHiddenCalendars } from "@/lib/macCalendar";

export async function GET() {
  const [mac, hidden] = await Promise.all([getMacCalendar(), getHiddenCalendars()]);
  const counts = new Map<string, number>();
  for (const e of mac?.events ?? []) counts.set(e.calendarId, (counts.get(e.calendarId) ?? 0) + 1);
  return NextResponse.json({
    updatedAt: mac?.updatedAt ?? null,
    hidden,
    calendars: (mac?.calendars ?? []).map((c) => ({ ...c, events: counts.get(c.id) ?? 0 })),
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (!Array.isArray(body.hidden)) return NextResponse.json({ error: "hidden array required" }, { status: 400 });
  await setHiddenCalendars(body.hidden.filter((x: unknown): x is string => typeof x === "string").slice(0, 300));
  return NextResponse.json({ ok: true });
}
