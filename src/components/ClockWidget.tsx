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
        hour: "numeric",
        minute: "2-digit",
        second: size === "xl" ? "2-digit" : undefined,
      })
    : "--:--";
  const [clock, meridiem] = (() => {
    const m = time.match(/^(.*?)\s?([AP]M)$/i);
    return m ? [m[1], m[2]] : [time, ""];
  })();
  const date = now?.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) ?? "";

  if (size === "sm") {
    return <div className="num-rounded text-3xl font-semibold text-gradient-white">{time}</div>;
  }

  const sizeClass = size === "xl" ? "text-[11rem]" : size === "lg" ? "text-9xl" : "text-7xl";

  return (
    <div className="flex flex-col items-start justify-center w-full h-full px-6">
      <div className="flex items-baseline gap-3 leading-none">
        <span className={`${sizeClass} num-rounded font-semibold text-gradient-white leading-none`}>{clock}</span>
        {meridiem && <span className="num-rounded text-3xl font-semibold text-white/60">{meridiem}</span>}
      </div>
      <div className="mt-4 text-sm font-semibold uppercase tracking-[0.25em] text-white/50 [font-stretch:expanded]">
        {date.replace(", ", " · ")}
      </div>
    </div>
  );
}
