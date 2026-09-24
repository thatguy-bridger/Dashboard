"use client";

import { useCallback, useEffect, useState } from "react";
import type { Device } from "@/lib/registry";

export default function ControlPage() {
  const [devices, setDevices] = useState<Device[] | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/devices");
    if (!res.ok) return;
    const data = await res.json();
    setDevices(data.devices);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
  }

  return (
    <main className="flex-1 p-10 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-semibold mb-1">Controller</h1>
      <p className="text-[var(--muted)] mb-8">
        Approve devices, name them, and (soon) assign each a layout.
      </p>

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
                        patch(d.id, { name: e.target.value });
                      }
                    }}
                    className="bg-transparent border-b border-[var(--surface-border)] text-sm font-medium outline-none focus:border-[var(--accent)] w-40"
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
                <div className="text-xs text-[var(--muted)] truncate">{d.userAgent}</div>
              </div>

              <div className="flex gap-2 shrink-0">
                {d.status !== "approved" && (
                  <button
                    onClick={() => patch(d.id, { status: "approved" })}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Approve
                  </button>
                )}
                {d.status !== "rejected" && (
                  <button
                    onClick={() => patch(d.id, { status: "rejected" })}
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
    </main>
  );
}
