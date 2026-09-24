import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/google";
import { getICloudEvents } from "@/lib/icloud";

interface CalendarEvent {
  summary: string;
  start: string;
  allDay: boolean;
  source: string;
}

async function fetchGoogleEvents(): Promise<CalendarEvent[]> {
  const token = await getValidAccessToken();
  if (!token) return [];

  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", now.toISOString());
  url.searchParams.set("timeMax", end.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "10");

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();

  return (data.items ?? []).map((e: { summary?: string; start: { dateTime?: string; date?: string } }) => ({
    summary: e.summary ?? "(no title)",
    start: e.start.dateTime ?? e.start.date,
    allDay: !e.start.dateTime,
    source: "Google",
  }));
}

async function fetchICloudEvents(): Promise<CalendarEvent[]> {
  try {
    const events = await getICloudEvents();
    return events.map((e) => ({
      summary: e.summary,
      start: e.start,
      allDay: e.start.length === 8,
      source: e.calendar,
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  const [google, icloud] = await Promise.all([fetchGoogleEvents(), fetchICloudEvents()]);
  const events = [...google, ...icloud].sort((a, b) => a.start.localeCompare(b.start));

  const googleConnected = (await getValidAccessToken()) !== null;
  const icloudConnected = Boolean(process.env.ICLOUD_EMAIL && process.env.ICLOUD_APP_PASSWORD);

  return NextResponse.json({
    connected: googleConnected || icloudConnected,
    events: events.slice(0, 12),
  });
}
