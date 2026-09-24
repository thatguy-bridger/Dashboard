import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";

// TheSportsDB's public test key ("3") — fine for low-volume personal use;
// swap for a real key at thesportsdb.com/api.php if this ever needs more headroom.
const BASE = "https://www.thesportsdb.com/api/v1/json/3";

// A fixed spread of major leagues for the "all sports" digest — the free
// tier has no single "everything happening today" endpoint, so this queries
// each league's recent results and merges them.
const LEAGUES = [
  { id: "4391", name: "NFL" },
  { id: "4387", name: "NBA" },
  { id: "4424", name: "MLB" },
  { id: "4380", name: "NHL" },
  { id: "4328", name: "Premier League" },
  { id: "4346", name: "MLS" },
];

const SPORTS_NEWS_FEED = "https://www.espn.com/espn/rss/news";

async function getFavorite() {
  const { favoriteTeam } = await getSettings();
  if (!favoriteTeam) {
    return { team: null, event: null };
  }

  const searchRes = await fetch(`${BASE}/searchteams.php?t=${encodeURIComponent(favoriteTeam)}`, {
    next: { revalidate: 3600 },
  });
  if (!searchRes.ok) {
    return { error: "team search failed" };
  }
  const searchData = await searchRes.json();
  const team = searchData.teams?.[0];
  if (!team) {
    return { team: null, event: null };
  }

  const eventsRes = await fetch(`${BASE}/eventsnext.php?id=${team.idTeam}`, {
    next: { revalidate: 900 },
  });
  const eventsData = eventsRes.ok ? await eventsRes.json() : null;
  const nextEvent = eventsData?.events?.[0] ?? null;

  return {
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
  };
}

async function getLeagueScore(league: { id: string; name: string }) {
  try {
    const res = await fetch(`${BASE}/eventspastleague.php?id=${league.id}`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const event = (data.events ?? []).find(
      (e: { intHomeScore: string | null; intAwayScore: string | null }) =>
        e.intHomeScore != null && e.intAwayScore != null
    );
    if (!event) return null;
    return {
      league: league.name,
      home: event.strHomeTeam,
      away: event.strAwayTeam,
      homeScore: event.intHomeScore,
      awayScore: event.intAwayScore,
      date: event.dateEvent,
    };
  } catch {
    return null;
  }
}

async function getTicker() {
  try {
    const res = await fetch(SPORTS_NEWS_FEED, { next: { revalidate: 900 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const decodeEntities = (s: string) =>
      s
        .replace(/&amp;/g, "&")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
    return [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g)]
      .map((m) => decodeEntities(m[1].replace("<![CDATA[", "").replace("]]>", "").trim()))
      .filter(Boolean)
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function getAll() {
  const [scores, ticker] = await Promise.all([
    Promise.all(LEAGUES.map(getLeagueScore)),
    getTicker(),
  ]);
  return { scores: scores.filter((s) => s !== null), ticker };
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  const result = mode === "all" ? await getAll() : await getFavorite();
  if ("error" in result) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
