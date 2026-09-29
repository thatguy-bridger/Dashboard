"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";
import type { MapPlace } from "@/lib/settings";

interface EtaData {
  travelTimeMin: number;
  delayMin: number;
  distanceMiles: number;
}

function useSettings() {
  const [settings, setSettings] = useState<{ mapHome: MapPlace | null; mapDestination: MapPlace | null } | null>(
    null
  );
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSettings(data.settings);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return settings;
}

function useEta(home: MapPlace | null, destination: MapPlace | null) {
  const [eta, setEta] = useState<EtaData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!home || !destination) return;
    let cancelled = false;

    function load() {
      const url = `/api/traffic/eta?originLat=${home!.lat}&originLon=${home!.lon}&destLat=${destination!.lat}&destLon=${destination!.lon}`;
      fetch(url)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => {
          if (!cancelled) {
            setEta(data);
            setError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    }

    load();
    const id = setInterval(load, 3 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [home, destination]);

  return { eta, error };
}

export function TrafficWidget({ size = "md" }: { size?: WidgetSize }) {
  const settings = useSettings();
  const home = settings?.mapHome ?? null;
  const destination = settings?.mapDestination ?? null;
  const { eta, error } = useEta(home, destination);

  if (settings && (!home || !destination)) {
    return (
      <div className="text-xs text-[var(--muted)] text-center px-2">
        Set a home location and destination in Settings to see live drive time.
      </div>
    );
  }

  if (!settings) {
    return <div className="text-sm text-[var(--muted)]">Loading traffic…</div>;
  }

  if (error) {
    return <div className="text-sm text-[var(--muted)]">Traffic unavailable</div>;
  }

  if (size === "sm") {
    return <div className="text-4xl font-semibold tabular-nums">{eta ? `${eta.travelTimeMin}m` : "--"}</div>;
  }

  const mapUrl =
    size !== "md"
      ? `/api/traffic/map?lat=${destination!.lat}&lon=${destination!.lon}&zoom=11&width=520&height=320`
      : null;

  return (
    <div className="flex flex-col items-center gap-2 w-full h-full">
      {mapUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- proxied, server-fetched map tile, not a static asset
        <img src={mapUrl} alt="" className="rounded-lg w-full flex-1 object-cover min-h-0" />
      )}
      <div className="flex flex-col items-center">
        <div className="text-4xl font-semibold tabular-nums">{eta ? `${eta.travelTimeMin} min` : "--"}</div>
        <div className="text-xs text-[var(--muted)]">
          to {destination!.label}
          {eta && eta.delayMin > 0 ? ` · +${eta.delayMin}m traffic` : eta ? " · clear" : ""}
        </div>
      </div>
    </div>
  );
}
