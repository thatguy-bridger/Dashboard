"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import { LivingOrb } from "@/components/LivingOrb";
import { WidgetRenderer } from "@/components/WidgetRenderer";
import { ScreenBackground } from "@/components/ScreenBackground";
import type { Preset, PresetWidget } from "@/lib/presets";
import type { DeviceLayout } from "@/lib/registry";
import { GRID_COLS, GRID_ROWS, sizeForFootprint } from "@/lib/grid";
import { DEFAULT_BACKGROUND, type BackgroundConfig } from "@/lib/background";

const DEFAULT_WIDGETS: PresetWidget[] = [
  { id: "clock-default", type: "clock", x: 0, y: 0, w: 6, h: 4 },
  { id: "weather-default", type: "weather", x: 6, y: 0, w: 4, h: 3 },
];

/** The control page's live draft editor sends its in-progress layout as base64 JSON. */
function parseDraft(raw: string): { widgets: PresetWidget[]; background: BackgroundConfig } | null {
  try {
    const json = JSON.parse(decodeURIComponent(escape(atob(raw))));
    if (!Array.isArray(json.widgets)) return null;
    return { widgets: json.widgets, background: json.background ?? DEFAULT_BACKGROUND };
  } catch {
    return null;
  }
}

/** Polls a device's own record by id — used for the controller's live mirror. */
function usePreviewDevice(deviceId: string | null) {
  const [device, setDevice] = useState<{
    status: string;
    name: string | null;
    presetId: string | null;
    layout: DeviceLayout | null;
  } | null>(null);
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

function ScreenGrid({
  widgets,
  background,
  name,
  orbState,
}: {
  widgets: PresetWidget[];
  background: BackgroundConfig;
  name: string;
  orbState: "idle" | "active" | "alert";
}) {
  return (
    <div className="h-screen w-screen relative">
      <ScreenBackground config={background} />
      <StatusBadge name={name} orbState={orbState} />
      <div className="h-full w-full p-3 relative">
        {widgets.map((w) => (
          <div
            key={w.id}
            className={`tile tile-${w.type} absolute`}
            style={{
              left: `calc(${(w.x / GRID_COLS) * 100}% + 0.375rem)`,
              top: `calc(${(w.y / GRID_ROWS) * 100}% + 0.375rem)`,
              width: `calc(${(w.w / GRID_COLS) * 100}% - 0.75rem)`,
              height: `calc(${(w.h / GRID_ROWS) * 100}% - 0.75rem)`,
            }}
          >
            <WidgetRenderer type={w.type} size={sizeForFootprint(w.w, w.h)} />
          </div>
        ))}
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

  const draft = draftParam !== null ? parseDraft(draftParam) : null;

  const ownDevice = useDevice();
  const previewDevice = usePreviewDevice(previewId);

  const isDraft = draft !== null;
  const isPreview = !isDraft && previewId !== null;

  const device = isPreview ? previewDevice : ownDevice.device;
  const deviceId = isPreview ? previewId : ownDevice.deviceId;
  const approved = isDraft || device?.status === "approved";
  const usesPreset = !isDraft && !device?.layout;
  const preset = usePreset(usesPreset ? device?.presetId ?? null : null);
  const widgets = isDraft ? draft!.widgets : (device?.layout?.widgets ?? preset?.widgets ?? DEFAULT_WIDGETS);
  const background = isDraft
    ? draft!.background
    : (device?.layout?.background ?? preset?.background ?? DEFAULT_BACKGROUND);

  if (!approved) {
    return <UnapprovedNotice deviceId={deviceId} status={device?.status} />;
  }

  return <ScreenGrid widgets={widgets} background={background} name={device?.name ?? "Home Base"} orbState="idle" />;
}

export default function ScreenPage() {
  return (
    <Suspense fallback={null}>
      <ScreenPageInner />
    </Suspense>
  );
}
