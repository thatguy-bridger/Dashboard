import { NextRequest, NextResponse } from "next/server";
import { saveMacCalendar, type MacCalendarInfo, type MacEvent } from "@/lib/macCalendar";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** The Mac's calendar sync posts here (same shared secret as the notifications endpoint). */
export async function POST(req: NextRequest) {
  const expected = process.env.NOTIFY_TOKEN;
  if (!expected || req.headers.get("x-notify-token") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  if (!Array.isArray(body.events) || !Array.isArray(body.calendars)) {
    return NextResponse.json({ error: "events and calendars arrays are required" }, { status: 400 });
  }

  const calendars: MacCalendarInfo[] = body.calendars.slice(0, 200).map((c: Record<string, unknown>) => ({
    id: `${str(c.account, 80)}|${str(c.name, 80)}`,
    name: str(c.name, 80),
    account: str(c.account, 80),
    color: typeof c.color === "string" ? c.color.slice(0, 9) : null,
  }));

  const events: MacEvent[] = body.events
    .slice(0, 2500)
    .filter((e: Record<string, unknown>) => typeof e.summary === "string" && typeof e.start === "string")
    .map((e: Record<string, unknown>) => ({
      summary: str(e.summary, 160),
      start: str(e.start, 40),
      ...(typeof e.end === "string" ? { end: str(e.end, 40) } : {}),
      allDay: Boolean(e.allDay),
      calendarId: `${str(e.account, 80)}|${str(e.calendar, 80)}`,
      calendar: str(e.calendar, 80),
      color: typeof e.color === "string" ? e.color.slice(0, 9) : null,
    }));

  await saveMacCalendar({ updatedAt: Date.now(), events, calendars });
  return NextResponse.json({ ok: true, events: events.length, calendars: calendars.length });
}
