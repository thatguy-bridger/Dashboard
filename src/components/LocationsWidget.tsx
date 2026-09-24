"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface LocatedDevice {
  id: string;
  name: string;
  batteryLevel: number | null;
  latitude: number | null;
  longitude: number | null;
  isOld: boolean;
  timestamp: number | null;
}

interface FindMyData {
  status: "connected" | "pending_code" | "disconnected" | "error";
  devices: LocatedDevice[];
  error?: string;
}

function formatAge(timestamp: number | null) {
  if (!timestamp) return "";
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

/** Shows Find My device locations. Connecting the account (password + 2FA
 * code) happens in the control panel, not here — this widget is read-only. */
export function LocationsWidget({ size = "md" }: { size?: WidgetSize }) {
  const [data, setData] = useState<FindMyData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/icloud/findmy", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data) return <div className="text-sm text-[var(--muted)]">Loading locations…</div>;

  if (data.status === "disconnected") {
    return <div className="text-sm text-[var(--muted)]">iCloud Find My not connected</div>;
  }
  if (data.status === "pending_code") {
    return <div className="text-sm text-[var(--muted)]">Waiting for 2FA code — finish connecting in Control</div>;
  }
  if (data.status === "error" || data.devices.length === 0) {
    return <div className="text-sm text-[var(--muted)]">No locations available</div>;
  }

  const count = size === "sm" ? 1 : size === "md" ? 3 : size === "lg" ? 6 : 10;

  return (
    <div className="w-full max-w-lg">
      <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-3 text-center">Locations</div>
      <ul className="flex flex-col gap-2">
        {data.devices.slice(0, count).map((d) => (
          <li
            key={d.id}
            className="flex justify-between gap-3 text-sm border-t border-[var(--surface-border)] pt-2 first:border-t-0 first:pt-0"
          >
            <span className="truncate">{d.name}</span>
            <span className="text-[var(--muted)] text-xs whitespace-nowrap">
              {d.latitude != null && d.longitude != null
                ? `${d.latitude.toFixed(3)}, ${d.longitude.toFixed(3)}`
                : "no fix"}
              {d.timestamp ? ` · ${formatAge(d.timestamp)}` : ""}
              {d.isOld ? " (stale)" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
