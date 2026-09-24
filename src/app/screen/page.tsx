"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import { LivingOrb } from "@/components/LivingOrb";
import { WidgetRenderer } from "@/components/WidgetRenderer";
import type { Preset, PresetWidget, WidgetSize } from "@/lib/presets";
import { WIDGET_TYPES, WIDGET_SIZES, SIZE_SPANS } from "@/lib/presets";

const DEFAULT_WIDGETS: PresetWidget[] = [
  { type: "clock", size: "lg" },
  { type: "weather", size: "md" },
];

function parseDraft(raw: string): PresetWidget[] {
  return raw
    .split(",")
    .map((entry) => {
      const [type, size] = entry.split(":");
      if (!(WIDGET_TYPES as readonly string[]).includes(type)) return null;
      const validSize = (WIDGET_SIZES as readonly string[]).includes(size) ? (size as WidgetSize) : "md";
      return { type, size: validSize } as PresetWidget;
    })
    .filter((w): w is PresetWidget => w !== null);
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

function StatusBadge({ name, orbState }: { name: string; orbState: "idle" | "active" | "alert" }) {
  return (
    <div className="fixed top-4 left-4 flex items-center gap-2 z-10 pointer-events-none">
      <LivingOrb state={orbState} size={16} />
      <span className="text-xs text-[var(--muted)] uppercase tracking-widest">{name}</span>
    </div>
  );
}

function ScreenGrid({ widgets, name, orbState }: { widgets: PresetWidget[]; name: string; orbState: "idle" | "active" | "alert" }) {
  return (
    <div className="h-screen w-screen relative">
      <StatusBadge name={name} orbState={orbState} />
      <div
        className="h-full w-full p-3 grid gap-3"
        style={{
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows: "repeat(3, 1fr)",
          gridAutoFlow: "row dense",
        }}
      >
        {widgets.map((w, i) => {
          const span = SIZE_SPANS[w.size];
          return (
            <div
              key={`${w.type}-${i}`}
              className={`tile tile-${w.type}`}
              style={{ gridColumn: `span ${span.col}`, gridRow: `span ${span.row}` }}
            >
              <WidgetRenderer type={w.type} size={w.size} />
            </div>
          );
        })}
      </div>
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

  const draftWidgets = draftParam !== null ? parseDraft(draftParam) : null;

  const ownDevice = useDevice();
  const previewDevice = usePreviewDevice(previewId);

  const isDraft = draftWidgets !== null;
  const isPreview = !isDraft && previewId !== null;

  const device = isPreview ? previewDevice : ownDevice.device;
  const deviceId = isPreview ? previewId : ownDevice.deviceId;
  const approved = isDraft || device?.status === "approved";
  const preset = usePreset(isDraft ? null : device?.presetId ?? null);
  const widgets = isDraft ? draftWidgets! : (preset?.widgets ?? DEFAULT_WIDGETS);

  if (!approved) {
    return <UnapprovedNotice deviceId={deviceId} status={device?.status} />;
  }

  return <ScreenGrid widgets={widgets} name={device?.name ?? "Home Base"} orbState="idle" />;
}

export default function ScreenPage() {
  return (
    <Suspense fallback={null}>
      <ScreenPageInner />
    </Suspense>
  );
}
