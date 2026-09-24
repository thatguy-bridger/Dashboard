"use client";

import { useCallback, useEffect, useState } from "react";
import type { Device } from "@/lib/registry";
import { WIDGET_TYPES, type Preset, type WidgetType } from "@/lib/presets";
import { ScreenPreview } from "@/components/ScreenPreview";

const WIDGET_LABELS: Record<WidgetType, string> = {
  clock: "Clock",
  weather: "Weather",
  worldclocks: "World clocks",
  news: "News headlines",
  sports: "Sports",
};

export default function ControlPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetWidgets, setNewPresetWidgets] = useState<WidgetType[]>(["clock", "weather"]);
  const [favoriteTeam, setFavoriteTeam] = useState("");
  const [teamSaved, setTeamSaved] = useState(false);

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [draftWidgets, setDraftWidgets] = useState<WidgetType[]>([]);
  const [publishing, setPublishing] = useState(false);

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
    const id = setInterval(() => {
      refreshDevices();
      refreshPresets();
    }, 5 * 1000);
    return () => clearInterval(id);
  }, [refreshDevices, refreshPresets]);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setFavoriteTeam(data.settings.favoriteTeam ?? ""));
  }, []);

  async function saveFavoriteTeam() {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favoriteTeam: favoriteTeam.trim() || null }),
    });
    setTeamSaved(true);
    setTimeout(() => setTeamSaved(false), 1500);
  }

  async function patchDevice(id: string, body: Record<string, unknown>) {
    await fetch(`/api/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    refreshDevices();
  }

  async function createPreset() {
    if (!newPresetName.trim()) return;
    await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPresetName.trim(), widgets: newPresetWidgets }),
    });
    setNewPresetName("");
    setNewPresetWidgets(["clock", "weather"]);
    refreshPresets();
  }

  async function deletePreset(id: string) {
    if (editingPresetId === id) setEditingPresetId(null);
    await fetch(`/api/presets/${id}`, { method: "DELETE" });
    refreshPresets();
  }

  function startEditing(preset: Preset) {
    setEditingPresetId(preset.id);
    setDraftWidgets(preset.widgets);
  }

  function toggleDraftWidget(type: WidgetType) {
    setDraftWidgets((current) =>
      current.includes(type) ? current.filter((w) => w !== type) : [...current, type]
    );
  }

  async function publishDraft() {
    if (!editingPresetId) return;
    setPublishing(true);
    await fetch(`/api/presets/${editingPresetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgets: draftWidgets }),
    });
    await refreshPresets();
    setPublishing(false);
  }

  function toggleWidget(type: WidgetType) {
    setNewPresetWidgets((current) =>
      current.includes(type) ? current.filter((w) => w !== type) : [...current, type]
    );
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
          <div className="flex flex-wrap gap-4">
            {approvedDevices.map((d) => (
              <div key={d.id} className="flex flex-col gap-1">
                <ScreenPreview src={`/screen?preview=${d.id}`} width={260} />
                <span className="text-xs text-[var(--muted)] text-center">{d.name ?? d.id.slice(0, 8)}</span>
              </div>
            ))}
          </div>
        )}
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
                </div>
                <div className="text-xs text-[var(--muted)] font-mono truncate">
                  {d.id} · {d.ip ?? "unknown ip"} · {d.touchCapable ? "touch" : "no-touch"}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
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
          Settings
        </h2>
        <div className="flex items-center gap-2">
          <input
            value={favoriteTeam}
            onChange={(e) => setFavoriteTeam(e.target.value)}
            placeholder="Favorite team (e.g. Lakers)"
            className="bg-transparent border border-[var(--surface-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)] flex-1"
          />
          <button
            onClick={saveFavoriteTeam}
            className="text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
          >
            {teamSaved ? "Saved" : "Save"}
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
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {p.widgets.map((w) => WIDGET_LABELS[w]).join(", ") || "no widgets"}
                  </div>
                </div>
                <div className="flex gap-2">
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

              {editingPresetId === p.id && (
                <div className="mt-4 flex flex-col md:flex-row gap-4 items-start bg-black/20 rounded-xl p-4">
                  <ScreenPreview src={`/screen?draft=${draftWidgets.join(",")}`} width={280} />
                  <div className="flex-1 flex flex-col gap-3">
                    <p className="text-xs text-[var(--muted)]">
                      This preview is a live render — the exact same code the screens run, just not published
                      yet. Toggle widgets, watch it update, then publish when it looks right.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {WIDGET_TYPES.map((type) => (
                        <button
                          key={type}
                          onClick={() => toggleDraftWidget(type)}
                          className={`text-xs px-3 py-1.5 rounded-lg border ${
                            draftWidgets.includes(type)
                              ? "bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent)]"
                              : "border-[var(--surface-border)] text-[var(--muted)]"
                          }`}
                        >
                          {WIDGET_LABELS[type]}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={publishDraft}
                      disabled={publishing}
                      className="self-start text-xs px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      {publishing ? "Publishing…" : "Publish to live devices"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--surface-border)] pt-4">
          <input
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="Preset name (e.g. Kitchen)"
            className="bg-transparent border border-[var(--surface-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <div className="flex flex-wrap gap-2">
            {WIDGET_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleWidget(type)}
                className={`text-xs px-3 py-1.5 rounded-lg border ${
                  newPresetWidgets.includes(type)
                    ? "bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--surface-border)] text-[var(--muted)]"
                }`}
              >
                {WIDGET_LABELS[type]}
              </button>
            ))}
          </div>
          <button
            onClick={createPreset}
            className="self-start text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
          >
            Create preset
          </button>
        </div>
      </section>
    </main>
  );
}
