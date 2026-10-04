"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDevice } from "@/lib/useDevice";
import { LivingOrb } from "@/components/LivingOrb";
import { WidgetRenderer } from "@/components/WidgetRenderer";
import { ScreenBackground } from "@/components/ScreenBackground";
import { LiveGameBanner } from "@/components/LiveGameBanner";
import { SpotifyIsland } from "@/components/SpotifyIsland";
import { useNowPlaying } from "@/lib/spotifyClient";
import { useArtTheme } from "@/lib/useArtTheme";
import type { Preset, PresetWidget } from "@/lib/presets";
import type { DeviceLayout } from "@/lib/registry";
import { GRID_COLS, GRID_ROWS, sizeForFootprint } from "@/lib/grid";
import { DEFAULT_BACKGROUND, type BackgroundConfig } from "@/lib/background";
import { TemporaryContentProvider } from "@/lib/temporaryContent";
import { isWidgetVisible, visibilityNeedsWeather, visibilityNeedsCalendar, type VisibilityContext } from "@/lib/visibility";

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
    const id = setInterval(load, 15 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [deviceId]);
  return device;
}

/** Devices with no preset assigned (brand new, just approved) fall back to
 * whichever preset is marked as the default rather than a fixed, uneditable
 * widget set — so pointing a new screen somewhere useful is just "set a
 * default preset" instead of a manual per-device step. */
function usePreset(presetId: string | null | undefined) {
  const [preset, setPreset] = useState<Preset | null>(null);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch("/api/presets", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          const presets: Preset[] = data.presets;
          const match = presetId
            ? presets.find((p) => p.id === presetId)
            : presets.find((p) => p.isDefault);
          setPreset(match ?? null);
        })
        .catch(() => {});
    }

    load();
    const id = setInterval(load, 20 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [presetId]);

  return preset;
}

function StatusBadge({ orbState }: { orbState: "idle" | "active" | "alert" }) {
  return (
    <div className="fixed top-4 left-4 z-10 pointer-events-none">
      <LivingOrb state={orbState} size={16} />
    </div>
  );
}

/** Re-evaluates every 30s (enough to catch a time-range boundary without
 * being wasteful) and only fetches weather/calendar at all when some widget
 * in the current layout actually has a rule that needs them. */
function useVisibilityContext(widgets: PresetWidget[]): VisibilityContext {
  const [now, setNow] = useState(() => new Date());
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [todaysEventTitles, setTodaysEventTitles] = useState<string[]>([]);

  const needsWeather = visibilityNeedsWeather(widgets);
  const needsCalendar = visibilityNeedsCalendar(widgets);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!needsWeather) return;
    let cancelled = false;
    function load() {
      fetch("/api/weather")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data) setWeatherCode(data.weatherCode);
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [needsWeather]);

  useEffect(() => {
    if (!needsCalendar) return;
    let cancelled = false;
    function load() {
      fetch("/api/calendar")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          const today = new Date().toDateString();
          const titles = (data.events ?? [])
            .filter((e: { start: string }) => new Date(e.start).toDateString() === today)
            .map((e: { summary: string }) => e.summary);
          setTodaysEventTitles(titles);
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [needsCalendar]);

  return { now, weatherCode, todaysEventTitles };
}

/** A temporary widget stays mounted (so it keeps polling) but its tile chrome
 *  only renders once the widget reports it actually has something to show. */
function TemporaryTile({ children }: { children: React.ReactNode }) {
  const [hasContent, setHasContent] = useState(true);
  return (
    <div style={{ display: hasContent ? "block" : "none", width: "100%", height: "100%" }}>
      <TemporaryContentProvider onContentChange={setHasContent}>{children}</TemporaryContentProvider>
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
  const visibilityCtx = useVisibilityContext(widgets);
  const now = useNowPlaying();
  const playing = Boolean(now?.connected && now.isPlaying && now.track);
  const { backdrop, accent } = useArtTheme(playing ? now?.track?.albumArtUrl : null);
  const visibleWidgets = widgets.filter((w) => isWidgetVisible(w.visibility, visibilityCtx));

  return (
    <div
      className="h-screen w-screen relative"
      style={{ ["--accent" as string]: playing ? accent : "#f0b38a" }}
    >
      <ScreenBackground config={background} />
      {/* album-art backdrop: pre-blurred once per song, cross-fades in */}
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center transition-opacity duration-[2500ms]"
        style={{
          backgroundImage: backdrop ? `url(${backdrop})` : undefined,
          opacity: playing && backdrop ? 0.6 : 0,
        }}
      />
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.6))" }}
      />
      <StatusBadge orbState={orbState} />
      <LiveGameBanner />
      <SpotifyIsland />
      <div className="h-full w-full p-[0.9375rem] relative">
        {visibleWidgets.map((w) => {
          const content = (
            <div className={`tile tile-${w.type} w-full h-full`}>
              <WidgetRenderer type={w.type} size={sizeForFootprint(w.w, w.h)} />
            </div>
          );
          return (
            <div
              key={w.id}
              className="absolute"
              style={{
                left: `calc(${(w.x / GRID_COLS) * 100}% + 0.1875rem)`,
                top: `calc(${(w.y / GRID_ROWS) * 100}% + 0.1875rem)`,
                width: `calc(${(w.w / GRID_COLS) * 100}% - 0.375rem)`,
                height: `calc(${(w.h / GRID_ROWS) * 100}% - 0.375rem)`,
              }}
            >
              {w.temporary ? <TemporaryTile>{content}</TemporaryTile> : content}
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
