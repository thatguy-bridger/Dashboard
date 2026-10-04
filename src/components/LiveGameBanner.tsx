"use client";

import { useEffect, useState } from "react";

interface LiveGame {
  home: string;
  away: string;
  homeScore: string;
  awayScore: string;
  status: string;
  league: string;
}

/** A thin top banner that only appears while the favorite team (set in
 * Control) has a game live — otherwise renders nothing, so it never takes
 * up space the rest of the time. */
export function LiveGameBanner() {
  const [game, setGame] = useState<LiveGame | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/sports?mode=live", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setGame(data.live);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!game) return null;

  return (
    <div className="absolute top-[4.25rem] left-1/2 -translate-x-1/2 z-10 flex items-center justify-center gap-3 px-5 py-2 rounded-full bg-black border border-white/10 text-sm">
      <span className="caps-label">{game.league}</span>
      <span className="font-medium">
        {game.away} {game.awayScore} — {game.homeScore} {game.home}
      </span>
      <span className="text-[var(--accent)] text-xs">{game.status}</span>
    </div>
  );
}
