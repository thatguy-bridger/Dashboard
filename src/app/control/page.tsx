"use client";

import { useDeviceId } from "@/lib/deviceId";

export default function ControlPage() {
  const deviceId = useDeviceId();

  return (
    <main className="flex-1 p-10 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-semibold mb-1">Controller</h1>
      <p className="text-[var(--muted)] mb-8">
        Admin view — approve devices, assign layouts, tune each screen.
      </p>

      <section className="glass-panel p-6">
        <h2 className="text-sm uppercase tracking-widest text-[var(--muted)] mb-3">
          Pending devices
        </h2>
        <p className="text-sm text-[var(--muted)]">
          No backend wired up yet — the device registry (Phase 2) will list
          every screen that has connected, with its IP, browser, and first-seen
          time, and let you approve, name, and assign a layout to each. Until
          then this is a placeholder.
        </p>
        <div className="mt-4 text-xs font-mono text-[var(--muted)]">
          this device: {deviceId ?? "…"}
        </div>
      </section>
    </main>
  );
}
