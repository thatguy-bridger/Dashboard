"use client";

import { useEffect, useState } from "react";
import { useDevice } from "@/lib/useDevice";
import { LivingOrb } from "@/components/LivingOrb";
import { WidgetRenderer } from "@/components/WidgetRenderer";
import type { Preset } from "@/lib/presets";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function usePreset(presetId: string | null | undefined) {
  const [preset, setPreset] = useState<Preset | null>(null);

  useEffect(() => {
    if (!presetId) {
      setPreset(null);
      return;
    }
    let cancelled = false;

    function load() {
      fetch("/api/presets", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setPreset(data.presets.find((p: Preset) => p.id === presetId) ?? null);
        })
        .catch(() => {
          // keep last known preset on a transient failure
        });
    }

    load();
    const id = setInterval(load, 5 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [presetId]);

  return preset;
}

export default function ScreenPage() {
  const { deviceId, device } = useDevice();
  const now = useClock();
  const approved = device?.status === "approved";
  const preset = usePreset(device?.presetId);
  const widgets = preset?.widgets.filter((w) => w !== "clock") ?? ["weather"];

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="glass-panel px-12 py-10 flex flex-col items-center gap-4">
        <div className="flex items-center gap-3">
          <LivingOrb state={approved ? "idle" : "alert"} />
          <span className="text-sm text-[var(--muted)] uppercase tracking-widest">
            {device?.name ?? "Home Base"}
          </span>
        </div>
        <div className="text-7xl font-semibold tabular-nums">
          {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
        </div>
        <div className="text-[var(--muted)]">
          {now?.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) ?? ""}
        </div>

        {approved ? (
          <div className="mt-4 flex flex-col items-center gap-6">
            {widgets.map((w) => (
              <WidgetRenderer key={w} type={w} />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-6 text-xs text-[var(--muted)] font-mono">
              {deviceId ? `device: ${deviceId.slice(0, 8)}` : "pairing…"}
            </div>
            <p className="text-xs text-[var(--muted)] max-w-xs text-center">
              {device?.status === "rejected"
                ? "This device was rejected from the controller."
                : "Unapproved device — waiting to be approved from the controller."}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
