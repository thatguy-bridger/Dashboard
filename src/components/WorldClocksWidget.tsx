"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

const ZONES: { label: string; tz: string }[] = [
  { label: "London", tz: "Europe/London" },
  { label: "Tokyo", tz: "Asia/Tokyo" },
  { label: "Los Angeles", tz: "America/Los_Angeles" },
  { label: "New York", tz: "America/New_York" },
  { label: "Sydney", tz: "Australia/Sydney" },
];

const ZONE_COUNT: Record<WidgetSize, number> = { sm: 1, md: 2, lg: 3, xl: 5 };

export function WorldClocksWidget({ size = "md" }: { size?: WidgetSize }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const zones = ZONES.slice(0, ZONE_COUNT[size]);
  const big = size === "lg" || size === "xl";

  return (
    <div className={`flex gap-6 flex-wrap justify-center ${size === "xl" ? "gap-10" : ""}`}>
      {zones.map((z) => (
        <div key={z.tz} className="flex flex-col items-center">
          <div className={`${big ? "text-3xl" : "text-lg"} font-medium tabular-nums`}>
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: z.tz })}
          </div>
          <div className="text-xs text-[var(--muted)]">{z.label}</div>
        </div>
      ))}
    </div>
  );
}
