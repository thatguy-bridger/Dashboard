"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

export function ClockWidget({ size = "md" }: { size?: WidgetSize }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: size === "xl" ? "2-digit" : undefined,
      })
    : "--:--";
  const date = now?.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) ?? "";

  if (size === "sm") {
    return <div className="text-3xl font-semibold tabular-nums">{time}</div>;
  }

  const sizeClass = size === "xl" ? "text-8xl md:text-9xl" : size === "lg" ? "text-7xl" : "text-6xl";

  return (
    <div className="flex flex-col items-center">
      <div className={`${sizeClass} font-semibold tabular-nums`}>{time}</div>
      <div className="text-[var(--muted)] mt-2 text-lg">{date}</div>
    </div>
  );
}
