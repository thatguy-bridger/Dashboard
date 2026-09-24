"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import { LivingOrb } from "@/components/LivingOrb";
import { WidgetRenderer } from "@/components/WidgetRenderer";
import type { Preset, WidgetType } from "@/lib/presets";
import { WIDGET_TYPES } from "@/lib/presets";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Polls a device's own record by id — used for the controller's live mirror. */
function usePreviewDevice(deviceId: string | null) {
  const [device, setDevice] = useState<{ status: string; name: string | null; presetId: string | null } | null>(
    null
  );
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    function load() {
      fetch(`/api/devices/${deviceId}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data) setDevice(data.device);
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 3 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [deviceId]);
  return device;
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
        .catch(() => {});
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

function ClockTile({ name, orbState }: { name: string; orbState: "idle" | "active" | "alert" }) {
  const now = useClock();
  return (
    <div className="tile tile-clock relative">
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <LivingOrb state={orbState} size={18} />
        <span className="text-xs text-[var(--muted)] uppercase tracking-widest">{name}</span>
      </div>
      <div className="text-6xl md:text-8xl font-semibold tabular-nums">
        {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
      </div>
      <div className="text-[var(--muted)] mt-2 text-lg">
        {now?.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) ?? ""}
      </div>
    </div>
  );
}

function ScreenGrid({ widgets, name, orbState }: { widgets: WidgetType[]; name: string; orbState: "idle" | "active" | "alert" }) {
  const others = widgets.filter((w) => w !== "clock");
  return (
    <div
      className="h-screen w-screen p-4 grid gap-4"
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(${others.length === 0 ? "100%" : "320px"}, 1fr))`,
        gridAutoRows: "1fr",
      }}
    >
      <ClockTile name={name} orbState={orbState} />
      {others.map((w) => (
        <div key={w} className={`tile tile-${w}`}>
          <WidgetRenderer type={w} />
        </div>
      ))}
    </div>
  );
}

function UnapprovedNotice({ deviceId, status }: { deviceId: string | null; status?: string }) {
  return (
    <main className="h-screen w-screen flex items-center justify-center">
      <div className="glass-panel px-12 py-10 flex flex-col items-center gap-3">
        <LivingOrb state="alert" />
        <div className="text-xs text-[var(--muted)] font-mono">
          {deviceId ? `device: ${deviceId.slice(0, 8)}` : "pairing…"}
        </div>
        <p className="text-xs text-[var(--muted)] max-w-xs text-center">
          {status === "rejected"
            ? "This device was rejected from the controller."
            : "Unapproved device — waiting to be approved from the controller."}
        </p>
      </div>
    </main>
  );
}

function ScreenPageInner() {
  const searchParams = useSearchParams();
  const draftParam = searchParams.get("draft");
  const previewId = searchParams.get("preview");

  const draftWidgets =
    draftParam !== null
      ? (draftParam.split(",").filter((w): w is WidgetType => WIDGET_TYPES.includes(w as WidgetType)) as WidgetType[])
      : null;

  const ownDevice = useDevice();
  const previewDevice = usePreviewDevice(previewId);

  const isDraft = draftWidgets !== null;
  const isPreview = !isDraft && previewId !== null;

  const device = isPreview ? previewDevice : ownDevice.device;
  const deviceId = isPreview ? previewId : ownDevice.deviceId;
  const approved = isDraft || device?.status === "approved";
  const preset = usePreset(isDraft ? null : device?.presetId ?? null);
  const widgets = isDraft ? draftWidgets! : (preset?.widgets ?? ["clock", "weather"]);

  if (!approved) {
    return <UnapprovedNotice deviceId={deviceId} status={device?.status} />;
  }

  return <ScreenGrid widgets={widgets} name={device?.name ?? "Home Base"} orbState={isDraft ? "idle" : "idle"} />;
}

export default function ScreenPage() {
  return (
    <Suspense fallback={null}>
      <ScreenPageInner />
    </Suspense>
  );
}
