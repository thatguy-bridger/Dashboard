import { NextResponse } from "next/server";

interface WikiEvent {
  text: string;
  year: number;
}

// Wikimedia's official "on this day" REST API — no key required.
export async function GET() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const res = await fetch(
    `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`,
    { next: { revalidate: 6 * 60 * 60 }, headers: { "User-Agent": "HomeBaseDashboard/1.0" } }
  );
  if (!res.ok) {
    return NextResponse.json({ error: "history fetch failed" }, { status: 502 });
  }
  const data = await res.json();

  const events: WikiEvent[] = (data.events ?? [])
    .map((e: { text: string; year: number }) => ({ text: e.text, year: e.year }))
    .slice(0, 10);

  return NextResponse.json({ events });
}
