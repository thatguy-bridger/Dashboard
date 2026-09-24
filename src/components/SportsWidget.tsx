"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface FavoriteData {
  team: { name: string; badge: string } | null;
  event: { opponent: string; isHome: boolean; date: string; time: string; league: string } | null;
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

function FavoriteView({ data, size }: { data: FavoriteData | null; size: WidgetSize }) {
  if (!data?.team) {
    return <div className="text-sm text-[var(--muted)]">No favorite team set</div>;
  }

  if (size === "sm") {
    return <div className="text-sm font-medium text-center">{data.team.name}</div>;
  }

  const big = size === "lg" || size === "xl";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${big ? "text-sm" : "text-xs"} uppercase tracking-widest text-[var(--muted)]`}>
        {data.team.name}
      </div>
      {data.event ? (
        <>
          <div className={big ? "text-2xl font-medium" : "text-lg font-medium"}>
            {data.event.isHome ? "vs" : "@"} {data.event.opponent}
          </div>
          <div className="text-xs text-[var(--muted)]">
            {data.event.date} · {data.event.league}
          </div>
          {size === "xl" && (
            <div className="text-xs text-[var(--muted)] mt-1">
              {data.event.isHome ? "Home game" : "Away game"} · {data.event.time || "Time TBD"}
            </div>
          )}
        </>
      ) : (
        <div className="text-sm text-[var(--muted)]">No upcoming game found</div>
      )}
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
      <div className={`${big ? "text-sm" : "text-xs"} uppercase tracking-widest text-[var(--muted)]`}>
        {s.league}
      </div>
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
  const [mode, setMode] = useState<"favorite" | "all">("favorite");
  const [favoriteData, setFavoriteData] = useState<FavoriteData | null>(null);
  const [allData, setAllData] = useState<AllSportsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/sports?mode=${mode}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (mode === "favorite") setFavoriteData(json);
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
    <div className="flex flex-col items-center gap-2">
      {showToggle && (
        <div className="flex gap-1 text-[10px] uppercase tracking-widest">
          <button
            onClick={() => setMode("favorite")}
            className={`px-2 py-0.5 rounded-full border ${
              mode === "favorite"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--surface-border)] text-[var(--muted)]"
            }`}
          >
            Favorite
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

      {mode === "favorite" || !showToggle ? (
        <FavoriteView data={favoriteData} size={size} />
      ) : (
        <>
          <ScoreCarousel scores={allData?.scores ?? []} size={size} />
          <NewsTicker headlines={allData?.ticker ?? []} />
        </>
      )}
    </div>
  );
}
