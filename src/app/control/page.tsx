"use client";

import { useCallback, useEffect, useState } from "react";
import type { Device } from "@/lib/registry";
import { WIDGET_TYPES, type Preset, type WidgetType } from "@/lib/presets";

const WIDGET_LABELS: Record<WidgetType, string> = {
  clock: "Clock",
  weather: "Weather",
  worldclocks: "World clocks",
  news: "News headlines",
};

export default function ControlPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetWidgets, setNewPresetWidgets] = useState<WidgetType[]>(["clock", "weather"]);

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
    await fetch(`/api/presets/${id}`, { method: "DELETE" });
    refreshPresets();
  }

  function toggleWidget(type: WidgetType) {
    setNewPresetWidgets((current) =>
      current.includes(type) ? current.filter((w) => w !== type) : [...current, type]
    );
  }

  return (
    <main className="flex-1 p-10 max-w-3xl mx-auto w-full flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Controller</h1>
        <p className="text-[var(--muted)]">
          Approve devices, name them, and quick-assign a preset layout to each.
        </p>
      </div>

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
          Presets
        </h2>

        <div className="flex flex-col gap-2 mb-6">
          {presets?.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No presets yet — create one below.</p>
          )}
          {presets?.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between border-t border-[var(--surface-border)] pt-2 first:border-t-0 first:pt-0"
            >
              <div>
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {p.widgets.map((w) => WIDGET_LABELS[w]).join(", ") || "no widgets"}
                </div>
              </div>
              <button
                onClick={() => deletePreset(p.id)}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30"
              >
                Delete
              </button>
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
