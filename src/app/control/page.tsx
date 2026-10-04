"use client";

import { useCallback, useEffect, useState } from "react";
import type { Device } from "@/lib/registry";
import type { Countdown } from "@/lib/countdowns";
import {
  WIDGET_TYPES,
  WIDGET_LABELS,
  PREFERRED_SIZE,
  VISIBILITY_WEATHER_CONDITIONS,
  type Preset,
  type PresetWidget,
  type WidgetVisibility,
  type VisibilityWeatherCondition,
} from "@/lib/presets";
import { ScreenPreview } from "@/components/ScreenPreview";
import { FindMyConnect } from "@/components/FindMyConnect";
import { GooglePhotosConnect } from "@/components/GooglePhotosConnect";
import { GridEditor } from "@/components/GridEditor";
import { BackgroundPicker } from "@/components/BackgroundPicker";
import { pollEvery } from "@/lib/poll";
import { CommutePicker } from "@/components/CommutePicker";
import { CalendarPicker } from "@/components/CalendarPicker";
import { RulesEditor } from "@/components/RulesEditor";
import { hasAnyRule } from "@/lib/visibility";
import { StandByEditor } from "@/components/StandByEditor";
import { defaultScenes, defaultStandByLayout, mergeScenes, type StandByItem, type StandByScene } from "@/lib/standby";
import { Modal } from "@/components/Modal";
import { WidgetIcon } from "@/components/icons/WidgetIcons";
import { findFreeSpot } from "@/lib/grid";
import { DEFAULT_BACKGROUND, type BackgroundConfig } from "@/lib/background";
import type { MapPlace, FavoriteTeam } from "@/lib/settings";
import { TeamSearchSelect } from "@/components/TeamSearchSelect";

const DEFAULT_DEVICE_WIDGETS: PresetWidget[] = [
  { id: "clock-default", type: "clock", x: 0, y: 0, w: 6, h: 4 },
  { id: "weather-default", type: "weather", x: 6, y: 0, w: 4, h: 3 },
];

function summarize(widgets: PresetWidget[]) {
  return widgets.map((w) => WIDGET_LABELS[w.type]).join(", ") || "no widgets";
}

/** Rules editor for whichever widget is currently selected in the GridEditor
 * next to it — renders nothing when no widget is selected, since there's no
 * per-widget settings panel elsewhere in this editor. */
function SelectedWidgetRules({
  widgets,
  selectedId,
  onChange,
}: {
  widgets: PresetWidget[];
  selectedId: string | null;
  onChange: (widgets: PresetWidget[]) => void;
}) {
  const selected = widgets.find((w) => w.id === selectedId);
  if (!selected) return null;

  function setVisibility(visibility: WidgetVisibility | undefined) {
    onChange(widgets.map((w) => (w.id === selectedId ? { ...w, visibility } : w)));
  }

  return (
    <div className="border-t border-[var(--surface-border)] pt-3">
      <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-2">
        Rules — {WIDGET_LABELS[selected.type]}
        {hasAnyRule(selected.visibility) ? " •" : ""}
      </div>
      <RulesEditor visibility={selected.visibility} onChange={setVisibility} />
    </div>
  );
}

/** Icon tiles for adding a new widget type to the grid — click to drop it in an open spot. */
function AddWidgetPalette({ widgets, onAdd }: { widgets: PresetWidget[]; onAdd: (widget: PresetWidget) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {WIDGET_TYPES.map((type) => (
        <button
          key={type}
          onClick={() => {
            const { w, h } = PREFERRED_SIZE[type] ?? { w: 4, h: 3 };
            const { x, y } = findFreeSpot(widgets, w, h);
            onAdd({ id: `${type}-${Date.now().toString(36)}`, type, x, y, w, h });
          }}
          className="flex flex-col items-center gap-1 w-20 py-2.5 rounded-lg border border-[var(--surface-border)] hover:border-[var(--accent)] hover:text-[var(--accent)] text-[var(--muted)]"
        >
          <WidgetIcon type={type} className="w-6 h-6" />
          <span className="text-[10px]">{WIDGET_LABELS[type]}</span>
        </button>
      ))}
    </div>
  );
}

export default function ControlPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetWidgets, setNewPresetWidgets] = useState<PresetWidget[]>([
    { id: "clock-new", type: "clock", x: 0, y: 0, w: 6, h: 4 },
    { id: "weather-new", type: "weather", x: 6, y: 0, w: 4, h: 3 },
  ]);
  const [newPresetSelected, setNewPresetSelected] = useState<string | null>(null);
  const [newPresetBackground, setNewPresetBackground] = useState<BackgroundConfig>(DEFAULT_BACKGROUND);
  const [creatingPreset, setCreatingPreset] = useState(false);
  const [favoriteTeams, setFavoriteTeams] = useState<FavoriteTeam[]>([]);
  const [displayMode, setDisplayMode] = useState<"color" | "image">("color");
  const [layoutMode, setLayoutMode] = useState<"standby" | "grid">("standby");
  const [standbyLayout, setStandbyLayout] = useState<StandByItem[]>(defaultStandByLayout());
  const [standbyScenes, setStandbyScenes] = useState<StandByScene[]>(defaultScenes());
  const [standbyEditorOpen, setStandbyEditorOpen] = useState(false);
  const [deviceStandByEditing, setDeviceStandByEditing] = useState<string | null>(null);
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [spotifyStatus, setSpotifyStatus] = useState<{ connected: boolean } | null>(null);
  const [mapHome, setMapHome] = useState<MapPlace | null>(null);
  const [mapDestination, setMapDestination] = useState<MapPlace | null>(null);
  const [homeQuery, setHomeQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [mapSaving, setMapSaving] = useState<"home" | "destination" | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [countdowns, setCountdowns] = useState<Countdown[] | null>(null);
  const [newCountdownLabel, setNewCountdownLabel] = useState("");
  const [newCountdownDate, setNewCountdownDate] = useState("");

  const refreshGoogleStatus = useCallback(async () => {
    const res = await fetch("/api/auth/google/status", { cache: "no-store" });
    if (res.ok) setGoogleStatus(await res.json());
  }, []);

  useEffect(() => {
    refreshGoogleStatus();
  }, [refreshGoogleStatus]);

  async function disconnectGoogle() {
    await fetch("/api/auth/google/status", { method: "DELETE" });
    refreshGoogleStatus();
  }

  const refreshSpotifyStatus = useCallback(async () => {
    const res = await fetch("/api/auth/spotify/status", { cache: "no-store" });
    if (res.ok) setSpotifyStatus(await res.json());
  }, []);

  useEffect(() => {
    refreshSpotifyStatus();
  }, [refreshSpotifyStatus]);

  async function disconnectSpotify() {
    await fetch("/api/auth/spotify/status", { method: "DELETE" });
    refreshSpotifyStatus();
  }

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [draftWidgets, setDraftWidgets] = useState<PresetWidget[]>([]);
  const [draftBackground, setDraftBackground] = useState<BackgroundConfig>(DEFAULT_BACKGROUND);
  const [draftSelected, setDraftSelected] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceDraftWidgets, setDeviceDraftWidgets] = useState<PresetWidget[]>([]);
  const [deviceDraftBackground, setDeviceDraftBackground] = useState<BackgroundConfig>(DEFAULT_BACKGROUND);
  const [deviceDraftSelected, setDeviceDraftSelected] = useState<string | null>(null);
  const [deviceSaving, setDeviceSaving] = useState(false);

  const refreshDevices = useCallback(async () => {
    const res = await fetch("/api/devices", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setDevices(data.devices);
  }, []);

  const refreshPresets = useCallback(async () => {
    const res = await fetch("/api/presets", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setPresets(data.presets);
  }, []);

  useEffect(() => {
    refreshDevices();
    refreshPresets();
    // Control only needs to notice new/approved devices, not track them live.
    return pollEvery(() => {
      refreshDevices();
      refreshPresets();
    }, 60 * 1000);
  }, [refreshDevices, refreshPresets]);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setFavoriteTeams(data.settings.favoriteTeams ?? []);
        setMapHome(data.settings.mapHome ?? null);
        setMapDestination(data.settings.mapDestination ?? null);
        setDisplayMode(data.settings.displayMode ?? "color");
        setLayoutMode(data.settings.layoutMode ?? "standby");
        if (data.settings.standbyLayout) setStandbyLayout(data.settings.standbyLayout);
        if (data.settings.standbyScenes) setStandbyScenes(mergeScenes(data.settings.standbyScenes));
      });
  }, []);

  async function saveFavoriteTeams(teams: FavoriteTeam[]) {
    setFavoriteTeams(teams);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favoriteTeams: teams }),
    });
  }

  async function saveDisplayMode(mode: "color" | "image") {
    setDisplayMode(mode);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayMode: mode }),
    });
  }

  async function saveLayoutMode(mode: "standby" | "grid") {
    setLayoutMode(mode);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layoutMode: mode }),
    });
  }

  async function saveStandbyLayout(items: StandByItem[], scenes: StandByScene[]) {
    setStandbyLayout(items);
    setStandbyScenes(scenes);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standbyLayout: items, standbyScenes: scenes }),
    });
  }

  async function saveMapPlace(kind: "home" | "destination") {
    const query = (kind === "home" ? homeQuery : destQuery).trim();
    if (!query) return;
    setMapSaving(kind);
    setMapError(null);
    const geo = await fetch(`/api/traffic/geocode?q=${encodeURIComponent(query)}`);
    if (!geo.ok) {
      const body = await geo.json().catch(() => ({}));
      setMapError(body.error ?? "Lookup failed");
      setMapSaving(null);
      return;
    }
    const place: MapPlace = await geo.json();
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [kind === "home" ? "mapHome" : "mapDestination"]: place }),
    });
    if (kind === "home") {
      setMapHome(place);
      setHomeQuery("");
    } else {
      setMapDestination(place);
      setDestQuery("");
    }
    setMapSaving(null);
  }

  async function clearMapPlace(kind: "home" | "destination") {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [kind === "home" ? "mapHome" : "mapDestination"]: null }),
    });
    if (kind === "home") setMapHome(null);
    else setMapDestination(null);
  }

  async function patchDevice(id: string, body: Record<string, unknown>) {
    await fetch(`/api/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    refreshDevices();
  }

  async function saveAsNewPreset(widgets: PresetWidget[], background: BackgroundConfig) {
    const name = window.prompt("Name this preset:")?.trim();
    if (!name) return;
    await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, widgets, background }),
    });
    await refreshPresets();
  }

  async function createPreset() {
    if (!newPresetName.trim()) return;
    await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPresetName.trim(), widgets: newPresetWidgets, background: newPresetBackground }),
    });
    setNewPresetName("");
    setNewPresetWidgets([
      { id: "clock-new", type: "clock", x: 0, y: 0, w: 6, h: 4 },
      { id: "weather-new", type: "weather", x: 6, y: 0, w: 4, h: 3 },
    ]);
    setNewPresetBackground(DEFAULT_BACKGROUND);
    setCreatingPreset(false);
    refreshPresets();
  }

  async function deletePreset(id: string) {
    if (editingPresetId === id) setEditingPresetId(null);
    await fetch(`/api/presets/${id}`, { method: "DELETE" });
    refreshPresets();
  }

  async function setDefaultPreset(id: string) {
    await fetch(`/api/presets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    refreshPresets();
  }

  function startEditing(preset: Preset) {
    setEditingPresetId(preset.id);
    setDraftWidgets(preset.widgets);
    setDraftBackground(preset.background);
    setDraftSelected(null);
  }

  async function publishDraft() {
    if (!editingPresetId) return;
    setPublishing(true);
    await fetch(`/api/presets/${editingPresetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgets: draftWidgets, background: draftBackground }),
    });
    await refreshPresets();
    setPublishing(false);
  }

  function loadDeviceDraftFromPreset(presetId: string) {
    const preset = presets?.find((p) => p.id === presetId);
    if (!preset) return;
    setDeviceDraftWidgets(preset.widgets);
    setDeviceDraftBackground(preset.background);
    setDeviceDraftSelected(null);
  }

  function startEditingDevice(d: Device) {
    setEditingDeviceId((current) => (current === d.id ? null : d.id));
    if (editingDeviceId === d.id) return;
    if (d.layout) {
      setDeviceDraftWidgets(d.layout.widgets);
      setDeviceDraftBackground(d.layout.background);
    } else {
      const preset = presets?.find((p) => p.id === d.presetId);
      setDeviceDraftWidgets(preset?.widgets ?? DEFAULT_DEVICE_WIDGETS);
      setDeviceDraftBackground(preset?.background ?? DEFAULT_BACKGROUND);
    }
    setDeviceDraftSelected(null);
  }

  async function saveDeviceLayout(id: string) {
    setDeviceSaving(true);
    await fetch(`/api/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: { widgets: deviceDraftWidgets, background: deviceDraftBackground } }),
    });
    await refreshDevices();
    setDeviceSaving(false);
  }

  async function revertDeviceToPreset(d: Device) {
    setDeviceSaving(true);
    await fetch(`/api/devices/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: null }),
    });
    await refreshDevices();
    const preset = presets?.find((p) => p.id === d.presetId);
    setDeviceDraftWidgets(preset?.widgets ?? DEFAULT_DEVICE_WIDGETS);
    setDeviceDraftBackground(preset?.background ?? DEFAULT_BACKGROUND);
    setDeviceSaving(false);
  }

  const refreshCountdowns = useCallback(async () => {
    const res = await fetch("/api/countdowns", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setCountdowns(data.countdowns);
  }, []);

  useEffect(() => {
    refreshCountdowns();
  }, [refreshCountdowns]);

  async function createCountdown() {
    if (!newCountdownLabel.trim() || !newCountdownDate) return;
    await fetch("/api/countdowns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: newCountdownLabel.trim(),
        targetDate: new Date(newCountdownDate).getTime(),
      }),
    });
    setNewCountdownLabel("");
    setNewCountdownDate("");
    refreshCountdowns();
  }

  async function deleteCountdown(id: string) {
    await fetch(`/api/countdowns/${id}`, { method: "DELETE" });
    refreshCountdowns();
  }

  const approvedDevices = devices?.filter((d) => d.status === "approved") ?? [];

  return (
    <main className="flex-1 p-10 max-w-5xl mx-auto w-full flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Controller</h1>
        <p className="text-[var(--muted)]">
          Approve devices, name them, and quick-assign a preset layout to each.
        </p>
      </div>

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-4">
          Live screens
        </h2>
        {approvedDevices.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No approved devices yet — approved screens will mirror live here.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              {approvedDevices.map((d) => (
                <div key={d.id} className="flex flex-col gap-1">
                  <button
                    onClick={() => startEditingDevice(d)}
                    className={`block rounded-xl overflow-hidden ${
                      editingDeviceId === d.id ? "ring-2 ring-[var(--accent)]" : "hover:ring-2 hover:ring-white/20"
                    }`}
                    title="Click to edit this screen"
                  >
                    <ScreenPreview src={`/screen?preview=${d.id}`} width={260} />
                  </button>
                  <span className="text-xs text-[var(--muted)] text-center">
                    {d.name ?? d.id.slice(0, 8)}
                    {d.layout && " · custom"}
                  </span>
                </div>
              ))}
            </div>

          </div>
        )}
      </section>

      {(() => {
        const d = approvedDevices.find((dv) => dv.id === editingDeviceId);
        return (
          <Modal
            open={!!d}
            onClose={() => setEditingDeviceId(null)}
            title={d ? `Editing ${d.name ?? d.id.slice(0, 8)}` : undefined}
            footer={
              d && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => saveDeviceLayout(d.id)}
                    disabled={deviceSaving}
                    className="self-start text-xs px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {deviceSaving ? "Saving…" : "Save to this screen"}
                  </button>
                  <button
                    onClick={() => saveAsNewPreset(deviceDraftWidgets, deviceDraftBackground)}
                    className="self-start text-xs px-4 py-2 rounded-lg border border-[var(--surface-border)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]"
                  >
                    Save as new preset
                  </button>
                </div>
              )
            }
          >
            {d && (
              <div className="flex flex-col gap-4 h-full">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-[var(--muted)] max-w-md">
                    Editing this screen directly — this only affects this screen. Its assigned preset stays
                    untouched, and other screens using that preset are unaffected.
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) loadDeviceDraftFromPreset(e.target.value);
                        e.target.value = "";
                      }}
                      className="bg-transparent border border-[var(--surface-border)] rounded-lg text-xs px-2 py-1.5"
                    >
                      <option value="" disabled>
                        Start from preset…
                      </option>
                      {presets?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {d.layout && (
                      <button
                        onClick={() => revertDeviceToPreset(d)}
                        disabled={deviceSaving}
                        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--surface-border)] text-[var(--muted)] hover:text-red-300 hover:border-red-400/40 disabled:opacity-50"
                      >
                        Revert to preset
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col lg:flex-row gap-6 items-start min-h-0">
                  <div className="w-full lg:flex-1 lg:h-full">
                    <GridEditor
                      widgets={deviceDraftWidgets}
                      onChange={setDeviceDraftWidgets}
                      selectedId={deviceDraftSelected}
                      onSelect={setDeviceDraftSelected}
                      background={deviceDraftBackground}
                    />
                  </div>
                  <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
                    <AddWidgetPalette
                      widgets={deviceDraftWidgets}
                      onAdd={(w) => setDeviceDraftWidgets([...deviceDraftWidgets, w])}
                    />
                    <div className="border-t border-[var(--surface-border)] pt-3">
                      <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-2">Background</div>
                      <BackgroundPicker value={deviceDraftBackground} onChange={setDeviceDraftBackground} />
                    </div>
                    <SelectedWidgetRules
                      widgets={deviceDraftWidgets}
                      selectedId={deviceDraftSelected}
                      onChange={setDeviceDraftWidgets}
                    />
                  </div>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-4">
          iCloud Find My
        </h2>
        <FindMyConnect />
      </section>

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-4">
          Devices
        </h2>

        {!devices && <p className="text-sm text-[var(--muted)]">Loading…</p>}
        {devices?.length === 0 && (
          <p className="text-sm text-[var(--muted)]">
            No devices have checked in yet. Open /screen on a device to see it appear here.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {devices?.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-4 border-t border-[var(--surface-border)] pt-3 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <input
                    defaultValue={d.name ?? ""}
                    placeholder={d.id.slice(0, 8)}
                    onBlur={(e) => {
                      if (e.target.value !== (d.name ?? "")) {
                        patchDevice(d.id, { name: e.target.value });
                      }
                    }}
                    className="bg-transparent border-b border-[var(--surface-border)] text-sm font-medium outline-none focus:border-[var(--accent)] w-36"
                  />
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      d.status === "approved"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : d.status === "rejected"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {d.status}
                  </span>
                  {d.presetId === null && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)]">
                      new
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--muted)] font-mono truncate">
                  {d.id} · {d.ip ?? "unknown ip"} · {d.touchCapable ? "touch" : "no-touch"}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  title="Which view this screen shows"
                  value={d.viewMode ?? ""}
                  onChange={(e) => patchDevice(d.id, { viewMode: e.target.value || null })}
                  className="bg-transparent border border-[var(--surface-border)] rounded-lg text-xs px-2 py-1.5"
                >
                  <option value="">View: follow global ({layoutMode === "standby" ? "StandBy" : "Tiles"})</option>
                  <option value="standby">View: StandBy</option>
                  <option value="grid">View: Tiles</option>
                </select>
                {(d.viewMode ?? layoutMode) === "standby" && (
                  <button
                    onClick={() => setDeviceStandByEditing(d.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg border ${d.standby ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--surface-border)] text-[var(--muted)]"}`}
                    title="Give this screen its own StandBy layout and scenes"
                  >
                    {d.standby ? "Own StandBy ✓" : "Own StandBy…"}
                  </button>
                )}
                {d.standby && (
                  <button
                    onClick={() => patchDevice(d.id, { standby: null })}
                    className="text-xs px-2 py-1.5 rounded-lg border border-[var(--surface-border)] text-[var(--muted)]"
                    title="Drop this screen's own StandBy and follow the global one"
                  >
                    Use global
                  </button>
                )}
                {(d.viewMode ?? layoutMode) === "standby" && (
                  <select
                    title="Which StandBy scene this screen shows"
                    value={d.sceneId ?? ""}
                    onChange={(e) => patchDevice(d.id, { sceneId: e.target.value || null })}
                    className="bg-transparent border border-[var(--surface-border)] rounded-lg text-xs px-2 py-1.5"
                  >
                    <option value="">Scene: automatic</option>
                    <option value="base">Scene: Default layout</option>
                    {standbyScenes.map((s) => (
                      <option key={s.id} value={s.id}>
                        Scene: {s.name}
                      </option>
                    ))}
                  </select>
                )}
                {(d.viewMode ?? layoutMode) === "grid" && (
                <select
                  value={d.presetId ?? ""}
                  onChange={(e) => patchDevice(d.id, { presetId: e.target.value || null })}
                  className="bg-transparent border border-[var(--surface-border)] rounded-lg text-xs px-2 py-1.5"
                >
                  <option value="">No preset</option>
                  {presets?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                )}
                {d.status !== "approved" && (
                  <button
                    onClick={() => patchDevice(d.id, { status: "approved" })}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Approve
                  </button>
                )}
                {d.status !== "rejected" && (
                  <button
                    onClick={() => patchDevice(d.id, { status: "rejected" })}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30"
                  >
                    Reject
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-4">
          Google Account
        </h2>
        {googleStatus?.connected ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--muted)]">Connected as {googleStatus.email}</span>
            <button
              onClick={disconnectGoogle}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/google/start"
            className="inline-block text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
          >
            Sign in with Google
          </a>
        )}
        <p className="text-xs text-[var(--muted)] mt-2">
          Signing in here shares your calendar/email with every screen — no need to sign in on each device.
        </p>
        {googleStatus?.connected && (
          <div className="mt-4 pt-4 border-t border-[var(--surface-border)]">
            <GooglePhotosConnect />
          </div>
        )}
      </section>

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-4">
          Spotify
        </h2>
        {spotifyStatus?.connected ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--muted)]">Connected</span>
            <button
              onClick={disconnectSpotify}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/spotify/start"
            className="inline-block text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
          >
            Sign in with Spotify
          </a>
        )}
        <p className="text-xs text-[var(--muted)] mt-2">
          Powers the always-on now-playing overlay on every screen, plus the optional Lyrics widget. Needs whatever
          account is actively playing to have playback visible to the Spotify app (not in a private/incognito
          session).
        </p>
      </section>

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-4">Commute</h2>
        <CommutePicker />
      </section>

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-4">Calendars (from your Mac)</h2>
        <CalendarPicker />
      </section>

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-4">
          Settings
        </h2>
        <div className="flex items-center justify-between gap-2 mb-4 pb-4 border-b border-[var(--surface-border)]">
          <div>
            <div className="text-sm font-medium">Screen layout</div>
            <p className="text-xs text-[var(--muted)]">
              StandBy is the prebuilt full-screen view (clock, weather, now playing with lyrics, agenda).
              Tiles switches every screen back to the customizable widget grid and presets.
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            {(["standby", "grid"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => saveLayoutMode(mode)}
                className={`text-xs px-3 py-1.5 rounded-lg border ${
                  layoutMode === mode
                    ? "bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--surface-border)] text-[var(--muted)]"
                }`}
              >
                {mode === "standby" ? "StandBy" : "Tiles"}
              </button>
            ))}
            <button
              onClick={() => setStandbyEditorOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--surface-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Edit StandBy…
            </button>
          </div>
          {deviceStandByEditing && (() => {
            const dev = devices?.find((x) => x.id === deviceStandByEditing);
            if (!dev) return null;
            return (
              <StandByEditor
                key={dev.id}
                open
                title={`StandBy — ${dev.name ?? dev.id.slice(0, 8)}`}
                onClose={() => setDeviceStandByEditing(null)}
                initialLayout={dev.standby?.layout ?? standbyLayout}
                initialScenes={dev.standby?.scenes ?? standbyScenes}
                onSave={async (layout, scenes) => {
                  await patchDevice(dev.id, { standby: { layout, scenes } });
                }}
              />
            );
          })()}
          {standbyEditorOpen && (
            <StandByEditor
              open
              onClose={() => setStandbyEditorOpen(false)}
              initialLayout={standbyLayout}
              initialScenes={standbyScenes}
              onSave={saveStandbyLayout}
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mb-4 pb-4 border-b border-[var(--surface-border)]">
          <div>
            <div className="text-sm font-medium">Display mode</div>
            <p className="text-xs text-[var(--muted)]">
              Color keeps every widget flat/minimal. Image lets widgets use real photos/logos and atmospheric
              effects where they have something to show (team badges, news header images, weather backdrops).
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            {(["color", "image"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => saveDisplayMode(mode)}
                className={`text-xs px-3 py-1.5 rounded-lg border capitalize ${
                  displayMode === mode
                    ? "bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--surface-border)] text-[var(--muted)]"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted)]">
            Favorite teams — the Sports widget shows up to 4 upcoming games across all of these. This free sports
            API only does single best-guess matching, so type the team&apos;s full name for reliable results.
          </span>
          <TeamSearchSelect value={favoriteTeams} onChange={saveFavoriteTeams} />
        </div>

        <div className="mt-5 pt-5 border-t border-[var(--surface-border)] flex flex-col gap-3">
          <div className="text-xs text-[var(--muted)]">
            Traffic widget — home and destination, used for the live drive-time estimate. Requires{" "}
            <code className="text-[10px]">TOMTOM_API_KEY</code> to be set in the environment.
          </div>

          {(["home", "destination"] as const).map((kind) => {
            const place = kind === "home" ? mapHome : mapDestination;
            const query = kind === "home" ? homeQuery : destQuery;
            const setQuery = kind === "home" ? setHomeQuery : setDestQuery;
            return (
              <div key={kind} className="flex items-center gap-2">
                <span className="text-xs text-[var(--muted)] w-20 capitalize shrink-0">{kind}</span>
                {place ? (
                  <>
                    <span className="text-sm flex-1 truncate">{place.label}</span>
                    <button
                      onClick={() => clearMapPlace(kind)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-[var(--surface-border)] text-[var(--muted)] hover:text-red-300 hover:border-red-400/40"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={kind === "home" ? "e.g. 123 Main St, Springfield" : "e.g. Work address"}
                      className="bg-transparent border border-[var(--surface-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)] flex-1"
                    />
                    <button
                      onClick={() => saveMapPlace(kind)}
                      disabled={mapSaving === kind}
                      className="text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
                    >
                      {mapSaving === kind ? "Looking up…" : "Set"}
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {mapError && <p className="text-xs text-red-300">{mapError}</p>}
        </div>
      </section>

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-4">
          Countdowns
        </h2>
        <div className="flex flex-col gap-2 mb-4">
          {countdowns?.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No countdowns yet — add one below.</p>
          )}
          {countdowns?.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between border-t border-[var(--surface-border)] pt-2 first:border-t-0 first:pt-0"
            >
              <div>
                <span className="text-sm font-medium">{c.label}</span>
                <span className="text-xs text-[var(--muted)] ml-2">
                  {new Date(c.targetDate).toLocaleDateString()}
                </span>
              </div>
              <button
                onClick={() => deleteCountdown(c.id)}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newCountdownLabel}
            onChange={(e) => setNewCountdownLabel(e.target.value)}
            placeholder="Label (e.g. Disneyland trip)"
            className="bg-transparent border border-[var(--surface-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)] flex-1"
          />
          <input
            type="date"
            value={newCountdownDate}
            onChange={(e) => setNewCountdownDate(e.target.value)}
            className="bg-transparent border border-[var(--surface-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={createCountdown}
            className="text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
          >
            Add
          </button>
        </div>
      </section>

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-4">
          Presets
        </h2>

        <div className="flex flex-col gap-4 mb-6">
          {presets?.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No presets yet — create one below.</p>
          )}
          {presets?.map((p) => (
            <div key={p.id} className="border-t border-[var(--surface-border)] pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{p.name}</div>
                    {p.isDefault && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)]">
                        default
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)]">{summarize(p.widgets)}</div>
                </div>
                <div className="flex gap-2">
                  {!p.isDefault && (
                    <button
                      onClick={() => setDefaultPreset(p.id)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-[var(--surface-border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    onClick={() => (editingPresetId === p.id ? setEditingPresetId(null) : startEditing(p))}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
                  >
                    {editingPresetId === p.id ? "Close editor" : "Edit"}
                  </button>
                  <button
                    onClick={() => deletePreset(p.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30"
                  >
                    Delete
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4 border-t border-[var(--surface-border)] pt-4">
          <button
            onClick={() => setCreatingPreset(true)}
            className="self-start text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
          >
            + New preset
          </button>
        </div>
      </section>

      {presets?.map((p) => (
        <Modal
          key={p.id}
          open={editingPresetId === p.id}
          onClose={() => setEditingPresetId(null)}
          title={`Editing ${p.name}`}
          footer={
            <div className="flex items-center gap-3">
              <button
                onClick={publishDraft}
                disabled={publishing}
                className="self-start text-xs px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                {publishing ? "Publishing…" : "Publish to live devices"}
              </button>
              <button
                onClick={() => saveAsNewPreset(draftWidgets, draftBackground)}
                className="self-start text-xs px-4 py-2 rounded-lg border border-[var(--surface-border)] text-[var(--muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]"
              >
                Save as new preset
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-4 h-full">
            <p className="text-xs text-[var(--muted)]">
              Drag widgets to move them, drag the bottom-right corner to resize, click an icon below to add one.
              Everything here is live — real data, real background — nothing is published until you hit publish.
            </p>
            <div className="flex-1 flex flex-col lg:flex-row gap-6 items-start min-h-0">
              <div className="w-full lg:flex-1 lg:h-full">
                <GridEditor
                  widgets={draftWidgets}
                  onChange={setDraftWidgets}
                  selectedId={draftSelected}
                  onSelect={setDraftSelected}
                  background={draftBackground}
                />
              </div>
              <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
                <AddWidgetPalette widgets={draftWidgets} onAdd={(w) => setDraftWidgets([...draftWidgets, w])} />
                <div className="border-t border-[var(--surface-border)] pt-3">
                  <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-2">Background</div>
                  <BackgroundPicker value={draftBackground} onChange={setDraftBackground} />
                </div>
                <SelectedWidgetRules widgets={draftWidgets} selectedId={draftSelected} onChange={setDraftWidgets} />
              </div>
            </div>
          </div>
        </Modal>
      ))}

      <Modal
        open={creatingPreset}
        onClose={() => setCreatingPreset(false)}
        title="New preset"
        footer={
          <button
            onClick={createPreset}
            className="self-start text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
          >
            Create preset
          </button>
        }
      >
        <div className="flex flex-col gap-4 h-full">
          <input
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Preset name (e.g. Kitchen)"
            className="bg-transparent border border-[var(--surface-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <div className="flex-1 flex flex-col lg:flex-row gap-6 items-start min-h-0">
            <div className="w-full lg:flex-1 lg:h-full">
              <GridEditor
                widgets={newPresetWidgets}
                onChange={setNewPresetWidgets}
                selectedId={newPresetSelected}
                onSelect={setNewPresetSelected}
                background={newPresetBackground}
              />
            </div>
            <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4">
              <AddWidgetPalette widgets={newPresetWidgets} onAdd={(w) => setNewPresetWidgets([...newPresetWidgets, w])} />
              <div className="border-t border-[var(--surface-border)] pt-3">
                <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-2">Background</div>
                <BackgroundPicker value={newPresetBackground} onChange={setNewPresetBackground} />
              </div>
              <SelectedWidgetRules
                widgets={newPresetWidgets}
                selectedId={newPresetSelected}
                onChange={setNewPresetWidgets}
              />
            </div>
          </div>
        </div>
      </Modal>
    </main>
  );
}
