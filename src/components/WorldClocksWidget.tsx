"use client";

import { useEffect, useState } from "react";

const ZONES: { label: string; tz: string }[] = [
  { label: "London", tz: "Europe/London" },
  { label: "Tokyo", tz: "Asia/Tokyo" },
  { label: "Los Angeles", tz: "America/Los_Angeles" },
];

export function WorldClocksWidget() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  return (
    <div className="flex gap-6">
      {ZONES.map((z) => (
        <div key={z.tz} className="flex flex-col items-center">
          <div className="text-lg font-medium tabular-nums">
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: z.tz })}
          </div>
          <div className="text-xs text-[var(--muted)]">{z.label}</div>
        </div>
      ))}
    </div>
  );
}
