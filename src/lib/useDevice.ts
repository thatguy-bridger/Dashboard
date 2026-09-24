"use client";

import { useEffect, useState } from "react";
import { useDeviceId } from "@/lib/deviceId";
import type { Device } from "@/lib/registry";

function detectTouch(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/**
 * Registers this device with the controller's registry on mount and every
 * 30s after (a heartbeat that also picks up approval/name changes), and
 * returns the device's current record once known.
 */
export function useDevice(): { deviceId: string | null; device: Device | null } {
  const deviceId = useDeviceId();
  const [device, setDevice] = useState<Device | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;

    async function checkIn() {
      try {
        const res = await fetch("/api/devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: deviceId, touchCapable: detectTouch() }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setDevice(data.device);
      } catch {
        // keep last known state on a transient network failure
      }
    }

    checkIn();
    const id = setInterval(checkIn, 30 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [deviceId]);

  return { deviceId, device };
}
