import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/settings";
import type { FavoriteTeam } from "@/lib/settings";

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

interface RawEvent {
  dateEvent: string;
  strTime: string | null;
  strHomeTeam: string;
  strAwayTeam: string;
  strLeague: string;
}

export interface GameSummary {
  team: string;
  teamBadge: string | null;
  opponent: string;
  isHome: boolean;
  date: string;
  time: string | null;
  league: string;
}

async function fetchUpcomingEvents(teamId: string): Promise<RawEvent[]> {
  const res = await fetch(`${BASE}/eventsnext.php?id=${teamId}`, { next: { revalidate: 900 } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.events ?? [];
}

function eventTimestamp(ev: RawEvent): number {
  return new Date(`${ev.dateEvent}T${ev.strTime || "00:00:00"}`).getTime();
}

function toSummary(team: FavoriteTeam, ev: RawEvent): GameSummary {
  const isHome = ev.strHomeTeam === team.name;
  return {
    team: team.name,
    teamBadge: team.badge,
    opponent: isHome ? ev.strAwayTeam : ev.strHomeTeam,
    isHome,
    date: ev.dateEvent,
    time: ev.strTime,
    league: ev.strLeague,
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Up to 4 upcoming games, one per favorite team by default — except a team's
 * *second* upcoming game is also included (filling remaining slots, soonest
 * first) when it falls within a week of that team's first, so a busy
 * back-to-back stretch isn't hidden behind the one-per-team cap. Two favorite
 * teams playing each other collapses to a single entry.
 */
function selectGames(perTeam: { team: FavoriteTeam; events: RawEvent[] }[]): GameSummary[] {
  type Candidate = { summary: GameSummary; ts: number };

  const primary: Candidate[] = [];
  for (const { team, events } of perTeam) {
    if (events.length === 0) continue;
    primary.push({ summary: toSummary(team, events[0]), ts: eventTimestamp(events[0]) });
  }
  primary.sort((a, b) => a.ts - b.ts);

  const selected = [...primary];
  if (selected.length < 4) {
    const extras: Candidate[] = [];
    for (const { team, events } of perTeam) {
      if (events.length < 2) continue;
      const firstTs = eventTimestamp(events[0]);
      const secondTs = eventTimestamp(events[1]);
      if (secondTs - firstTs <= WEEK_MS) {
        extras.push({ summary: toSummary(team, events[1]), ts: secondTs });
      }
    }
    extras.sort((a, b) => a.ts - b.ts);
    for (const extra of extras) {
      if (selected.length >= 4) break;
      selected.push(extra);
    }
  }
  selected.sort((a, b) => a.ts - b.ts);

  const seen = new Set<string>();
  const deduped: Candidate[] = [];
  for (const c of selected) {
    const key = `${c.summary.date}|${[c.summary.team, c.summary.opponent].sort().join("-")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  return deduped.slice(0, 4).map((c) => c.summary);
}

async function getFavorites() {
  const { favoriteTeams } = await getSettings();
  if (favoriteTeams.length === 0) {
    return { teams: [], games: [] };
  }
  const perTeam = await Promise.all(
    favoriteTeams.map(async (team) => ({ team, events: await fetchUpcomingEvents(team.id) }))
  );
  return { teams: favoriteTeams, games: selectGames(perTeam) };
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
      homeBadge: event.strHomeTeamBadge,
      awayBadge: event.strAwayTeamBadge,
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
  const [scores, ticker] = await Promise.all([Promise.all(LEAGUES.map(getLeagueScore)), getTicker()]);
  return { scores: scores.filter((s) => s !== null), ticker };
}

interface LiveScoreEntry {
  strHomeTeam: string;
  strAwayTeam: string;
  intHomeScore: string;
  intAwayScore: string;
  strStatus: string;
  strLeague: string;
}

/** The livescore endpoint has no team filter, so this pulls every live game
 * and matches any favorite team's name client-side — cheap since there are
 * only ever a handful of live games at once. */
async function getLiveGame() {
  const { favoriteTeams } = await getSettings();
  if (favoriteTeams.length === 0) return { live: null };

  try {
    const res = await fetch(`${BASE}/livescore.php`, { cache: "no-store" });
    if (!res.ok) return { live: null };
    const data = await res.json();
    const entries: LiveScoreEntry[] = data.livescore ?? [];
    const match = entries.find((e) =>
      favoriteTeams.some(
        (team) =>
          e.strHomeTeam.toLowerCase().includes(team.name.toLowerCase()) ||
          e.strAwayTeam.toLowerCase().includes(team.name.toLowerCase())
      )
    );
    if (!match) return { live: null };
    return {
      live: {
        home: match.strHomeTeam,
        away: match.strAwayTeam,
        homeScore: match.intHomeScore,
        awayScore: match.intAwayScore,
        status: match.strStatus,
        league: match.strLeague,
      },
    };
  } catch {
    return { live: null };
  }
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  if (mode === "live") {
    return NextResponse.json(await getLiveGame());
  }
  if (mode === "all") {
    return NextResponse.json(await getAll());
  }
  return NextResponse.json(await getFavorites());
}
