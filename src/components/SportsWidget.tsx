"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface Game {
  team: string;
  teamBadge: string | null;
  opponent: string;
  isHome: boolean;
  date: string;
  time: string | null;
  league: string;
}

interface FavoritesData {
  teams: { id: string; name: string }[];
  games: Game[];
}

interface LeagueScore {
  league: string;
  home: string;
  away: string;
  homeScore: string;
  awayScore: string;
  date: string;
}

interface AllSportsData {
  scores: LeagueScore[];
  ticker: string[];
}

function formatDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const today = new Date();
  const days = Math.round((d.getTime() - new Date(today.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function GameCard({ game, compact }: { game: Game; compact?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0 flex-1">
      <div className={`${compact ? "text-[10px]" : "text-xs"} uppercase tracking-widest text-[var(--muted)] truncate max-w-full`}>
        {game.team}
      </div>
      <div className={`${compact ? "text-sm" : "text-lg"} font-medium truncate max-w-full`}>
        {game.isHome ? "vs" : "@"} {game.opponent}
      </div>
      <div className="text-[10px] text-[var(--muted)] truncate max-w-full">
        {formatDate(game.date)}
        {game.time ? ` · ${game.time.slice(0, 5)}` : ""} · {game.league}
      </div>
    </div>
  );
}

/** Games on the same day render side by side instead of one being picked over the other. */
function groupByDate(games: Game[]): Game[][] {
  const groups = new Map<string, Game[]>();
  for (const g of games) {
    const list = groups.get(g.date) ?? [];
    list.push(g);
    groups.set(g.date, list);
  }
  return [...groups.values()];
}

function FavoritesView({ data, size }: { data: FavoritesData | null; size: WidgetSize }) {
  if (!data) return <div className="text-sm text-[var(--muted)]">Loading sports…</div>;
  if (data.teams.length === 0) return <div className="text-sm text-[var(--muted)]">No favorite teams set</div>;
  if (data.games.length === 0) return <div className="text-sm text-[var(--muted)]">No upcoming games found</div>;

  if (size === "sm") {
    const g = data.games[0];
    return (
      <div className="text-sm font-medium text-center truncate max-w-full">
        {g.team} {g.isHome ? "vs" : "@"} {g.opponent}
      </div>
    );
  }

  if (size === "md") {
    return (
      <div className="flex flex-col gap-2 w-full">
        {data.games.slice(0, 2).map((g, i) => (
          <GameCard key={i} game={g} compact />
        ))}
      </div>
    );
  }

  const groups = groupByDate(data.games);

  return (
    <div className="flex flex-col gap-3 w-full h-full justify-center">
      {groups.map((group, i) => (
        <div key={i} className="flex gap-3 items-stretch">
          {group.map((g, j) => (
            <GameCard key={j} game={g} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Rotates through one league's latest score at a time — a lightweight
 * carousel without needing a swipe/drag library for a kiosk display. */
function ScoreCarousel({ scores, size }: { scores: LeagueScore[]; size: WidgetSize }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (scores.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % scores.length), 6000);
    return () => clearInterval(id);
  }, [scores.length]);

  if (scores.length === 0) {
    return <div className="text-sm text-[var(--muted)]">No recent scores</div>;
  }

  const s = scores[index % scores.length];
  const big = size === "lg" || size === "xl";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${big ? "text-sm" : "text-xs"} uppercase tracking-widest text-[var(--muted)]`}>{s.league}</div>
      <div className={big ? "text-xl font-medium" : "text-base font-medium"}>
        {s.home} {s.homeScore} – {s.awayScore} {s.away}
      </div>
      <div className="text-xs text-[var(--muted)]">{s.date}</div>
      <div className="flex gap-1 mt-1">
        {scores.map((_, i) => (
          <span
            key={i}
            className={`h-1 w-1 rounded-full ${i === index % scores.length ? "bg-[var(--accent)]" : "bg-[var(--surface-border)]"}`}
          />
        ))}
      </div>
    </div>
  );
}

function NewsTicker({ headlines }: { headlines: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (headlines.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % headlines.length), 5000);
    return () => clearInterval(id);
  }, [headlines.length]);

  if (headlines.length === 0) return null;

  return (
    <div className="text-xs text-center text-[var(--muted)] line-clamp-2 max-w-xs">
      {headlines[index % headlines.length]}
    </div>
  );
}

export function SportsWidget({ size = "md" }: { size?: WidgetSize }) {
  const [mode, setMode] = useState<"favorites" | "all">("favorites");
  const [favoritesData, setFavoritesData] = useState<FavoritesData | null>(null);
  const [allData, setAllData] = useState<AllSportsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/sports${mode === "all" ? "?mode=all" : ""}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (mode === "favorites") setFavoritesData(json);
        else setAllData(json);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, mode === "all" ? 10 * 60 * 1000 : 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mode]);

  const showToggle = size !== "sm";

  return (
    <div className="flex flex-col items-center gap-2 w-full h-full justify-center">
      {showToggle && (
        <div className="flex gap-1 text-[10px] uppercase tracking-widest">
          <button
            onClick={() => setMode("favorites")}
            className={`px-2 py-0.5 rounded-full border ${
              mode === "favorites"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--surface-border)] text-[var(--muted)]"
            }`}
          >
            Favorites
          </button>
          <button
            onClick={() => setMode("all")}
            className={`px-2 py-0.5 rounded-full border ${
              mode === "all"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--surface-border)] text-[var(--muted)]"
            }`}
          >
            All sports
          </button>
        </div>
      )}

      {mode === "favorites" || !showToggle ? (
        <FavoritesView data={favoritesData} size={size} />
      ) : (
        <>
          <ScoreCarousel scores={allData?.scores ?? []} size={size} />
          <NewsTicker headlines={allData?.ticker ?? []} />
        </>
      )}
    </div>
  );
}
