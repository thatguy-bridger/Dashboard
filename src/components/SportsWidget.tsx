"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface SportsData {
  team: { name: string; badge: string } | null;
  event: { opponent: string; isHome: boolean; date: string; time: string; league: string } | null;
}

export function SportsWidget({ size = "md" }: { size?: WidgetSize }) {
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

  // sm: just the team name — enough to identify what this tile is about.
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
