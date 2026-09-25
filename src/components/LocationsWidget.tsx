"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";
import { LocationsMap } from "@/components/LocationsMap";

interface LocatedDevice {
  id: string;
  name: string;
  batteryLevel: number | null;
  latitude: number | null;
  longitude: number | null;
  isOld: boolean;
  timestamp: number | null;
  city: string | null;
  place: string | null;
  isPerson: boolean;
}

interface FindMyData {
  status: "connected" | "pending_code" | "disconnected" | "error";
  devices: LocatedDevice[];
  error?: string;
}

/** Shows Find My device locations on a custom-styled dark map, filling the
 * whole tile edge-to-edge rather than sitting in the standard tile padding
 * like the text/number widgets. Connecting the account (password + 2FA
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

  const withFix = data.devices.filter(
    (d): d is LocatedDevice & { latitude: number; longitude: number } => d.latitude != null && d.longitude != null
  );

  if (data.status === "error" || withFix.length === 0) {
    return <div className="text-sm text-[var(--muted)]">No locations available</div>;
  }

  return (
    <div className="relative w-full h-full">
      <LocationsMap devices={withFix} />
      {size !== "sm" && (
        <div className="absolute top-3 left-3 text-xs uppercase tracking-widest text-[var(--muted)] bg-[var(--background)]/60 px-2 py-1 rounded-md pointer-events-none">
          Locations
        </div>
      )}
    </div>
  );
}
