"use client";

import { useEffect, useState } from "react";
import { useDeviceId } from "@/lib/deviceId";
import { LivingOrb } from "@/components/LivingOrb";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function ScreenPage() {
  const deviceId = useDeviceId();
  const now = useClock();

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="glass-panel px-12 py-10 flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <LivingOrb state="idle" />
          <span className="text-sm text-[var(--muted)] uppercase tracking-widest">
            Home Base
          </span>
        </div>
        <div className="text-7xl font-semibold tabular-nums">
          {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
        </div>
        <div className="text-[var(--muted)]">
          {now?.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) ?? ""}
        </div>
        <div className="mt-6 text-xs text-[var(--muted)] font-mono">
          {deviceId ? `device: ${deviceId.slice(0, 8)}` : "pairing…"}
        </div>
        <p className="text-xs text-[var(--muted)] max-w-xs text-center">
          Unapproved device — widgets and layout will appear here once approved
          from the controller.
        </p>
      </div>
    </main>
  );
}
