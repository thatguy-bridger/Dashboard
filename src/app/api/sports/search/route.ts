import { NextRequest, NextResponse } from "next/server";

// TheSportsDB's public test key ("3") — fine for low-volume personal use;
// swap for a real key at thesportsdb.com/api.php if this ever needs more headroom.
const BASE = "https://www.thesportsdb.com/api/v1/json/3";

/** Type-ahead team search for the controller's favorite-teams picker. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ teams: [] });
  }

  const res = await fetch(`${BASE}/searchteams.php?t=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json({ error: "team search failed" }, { status: 502 });
  }
  const data = await res.json();

  const teams = (data.teams ?? []).slice(0, 15).map((t: Record<string, string>) => ({
    id: t.idTeam,
    name: t.strTeam,
    badge: t.strTeamBadge || null,
    sport: t.strSport || null,
    league: t.strLeague || null,
  }));

  return NextResponse.json({ teams });
}
