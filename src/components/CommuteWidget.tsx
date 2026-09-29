"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface CommuteData {
  status: "ok" | "not_configured" | "error";
  originLabel?: string;
  destLabel?: string;
  minutes?: number;
  delayMinutes?: number;
  miles?: number;
}

/** Live drive time between the two addresses set in Control, via TomTom's
 * traffic-aware routing — refreshes often enough to actually catch a
 * building jam, not just a static distance estimate. */
export function CommuteWidget({ size = "md" }: { size?: WidgetSize }) {
  const [data, setData] = useState<CommuteData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/commute", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 2 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data) return <div className="text-sm text-[var(--muted)]">Loading commute…</div>;
  if (data.status === "not_configured") {
    return <div className="text-sm text-[var(--muted)]">Set a commute route in Control</div>;
  }
  if (data.status === "error") {
    return <div className="text-sm text-[var(--muted)]">Commute unavailable</div>;
  }

  const heavy = (data.delayMinutes ?? 0) >= 10;
  const moderate = (data.delayMinutes ?? 0) >= 3;

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="text-5xl font-semibold tabular-nums">{data.minutes}</div>
      <div className="text-sm text-[var(--muted)]">minutes</div>
      {data.delayMinutes != null && data.delayMinutes > 0 && (
        <div className={`text-xs ${heavy ? "text-red-400" : moderate ? "text-amber-400" : "text-[var(--muted)]"}`}>
          +{data.delayMinutes} min traffic
        </div>
      )}
      {size !== "sm" && (
        <div className="text-xs text-[var(--muted)] mt-1">
          {data.originLabel?.split(",")[0]} → {data.destLabel?.split(",")[0]}
        </div>
      )}
    </div>
  );
}
