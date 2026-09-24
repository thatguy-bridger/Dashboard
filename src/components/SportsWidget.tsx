"use client";

import { useEffect, useState } from "react";

interface SportsData {
  team: { name: string; badge: string } | null;
  event: { opponent: string; isHome: boolean; date: string; time: string; league: string } | null;
}

export function SportsWidget() {
  const [data, setData] = useState<SportsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/sports");
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data?.team) {
    return <div className="text-sm text-[var(--muted)]">No favorite team set</div>;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-xs uppercase tracking-widest text-[var(--muted)]">{data.team.name}</div>
      {data.event ? (
        <>
          <div className="text-lg font-medium">
            {data.event.isHome ? "vs" : "@"} {data.event.opponent}
          </div>
          <div className="text-xs text-[var(--muted)]">
            {data.event.date} · {data.event.league}
          </div>
        </>
      ) : (
        <div className="text-sm text-[var(--muted)]">No upcoming game found</div>
      )}
    </div>
  );
}
