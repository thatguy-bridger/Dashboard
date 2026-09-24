import { NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

// TheSportsDB's public test key ("3") — fine for low-volume personal use;
// swap for a real key at thesportsdb.com/api.php if this ever needs more headroom.
const BASE = "https://www.thesportsdb.com/api/v1/json/3";

export async function GET() {
  const { favoriteTeam } = await getSettings();
  if (!favoriteTeam) {
    return NextResponse.json({ team: null, event: null });
  }

  const searchRes = await fetch(`${BASE}/searchteams.php?t=${encodeURIComponent(favoriteTeam)}`, {
    next: { revalidate: 3600 },
  });
  if (!searchRes.ok) {
    return NextResponse.json({ error: "team search failed" }, { status: 502 });
  }
  const searchData = await searchRes.json();
  const team = searchData.teams?.[0];
  if (!team) {
    return NextResponse.json({ team: null, event: null });
  }

  const eventsRes = await fetch(`${BASE}/eventsnext.php?id=${team.idTeam}`, {
    next: { revalidate: 900 },
  });
  const eventsData = eventsRes.ok ? await eventsRes.json() : null;
  const nextEvent = eventsData?.events?.[0] ?? null;

  return NextResponse.json({
    team: { name: team.strTeam, badge: team.strTeamBadge },
    event: nextEvent
      ? {
          opponent: nextEvent.strAwayTeam === team.strTeam ? nextEvent.strHomeTeam : nextEvent.strAwayTeam,
          isHome: nextEvent.strHomeTeam === team.strTeam,
          date: nextEvent.dateEvent,
          time: nextEvent.strTime,
          league: nextEvent.strLeague,
        }
      : null,
  });
}
