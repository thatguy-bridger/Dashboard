import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/google";
import { getICloudEvents } from "@/lib/icloud";

interface CalendarEvent {
  summary: string;
  start: string;
  allDay: boolean;
  end?: string;
  source: string;
  colorId: string | null;
}

async function safeGoogleToken(): Promise<string | null> {
  try {
    return await getValidAccessToken();
  } catch {
    // Refresh token expired/revoked — treat as disconnected instead of 500ing the whole calendar.
    return null;
  }
}

async function fetchGoogleEvents(): Promise<CalendarEvent[]> {
  const token = await safeGoogleToken();
  if (!token) return [];
  const headers = { Authorization: `Bearer ${token}` };

  // Every calendar on the account (shared, family, holidays, subscribed) — not just "primary".
  const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", {
    headers,
    cache: "no-store",
  });
  if (!listRes.ok) return [];
  const calendars: { id: string; summary?: string; selected?: boolean }[] = (await listRes.json()).items ?? [];

  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const perCalendar = await Promise.all(
    calendars
      .filter((c) => c.selected !== false)
      .map(async (cal): Promise<CalendarEvent[]> => {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`);
        url.searchParams.set("timeMin", now.toISOString());
        url.searchParams.set("timeMax", end.toISOString());
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("maxResults", "20");
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.items ?? []).map((e: { summary?: string; start: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }) => ({
          summary: e.summary ?? "(no title)",
          start: e.start.dateTime ?? e.start.date,
          allDay: !e.start.dateTime,
          end: e.end?.dateTime ?? e.end?.date,
          source: cal.summary ?? "Google",
        }));
      })
  );

  return perCalendar.flat();
}

async function fetchICloudEvents(): Promise<CalendarEvent[]> {
  try {
    const events = await getICloudEvents();
    return events.map((e) => ({
      summary: e.summary,
      start: e.start,
      allDay: e.start.length === 8,
      source: e.calendar,
      colorId: null,
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  const [google, icloud] = await Promise.all([fetchGoogleEvents(), fetchICloudEvents()]);
  const seen = new Set<string>();
  const events = [...google, ...icloud]
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((e) => {
      // The same event often appears in both Google and iCloud (the iPhone mirrors Google).
      const key = `${e.summary}|${e.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const googleConnected = (await safeGoogleToken()) !== null;
  const icloudConnected = Boolean(process.env.ICLOUD_EMAIL && process.env.ICLOUD_APP_PASSWORD);

  return NextResponse.json({
    connected: googleConnected || icloudConnected,
    events: events.slice(0, 25),
  });
}
