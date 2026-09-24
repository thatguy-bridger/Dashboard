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
 * 20s after (a heartbeat that reports ip/user-agent/touch capability), and
 * separately polls its own record every 3s (a cheap read, no write) so
 * approval and preset changes made from the controller show up almost
 * instantly without waiting on the heartbeat's write cycle.
 */
export function useDevice(): { deviceId: string | null; device: Device | null } {
  const deviceId = useDeviceId();
  const [device, setDevice] = useState<Device | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;

    async function heartbeat() {
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

    heartbeat();
    const id = setInterval(heartbeat, 20 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [deviceId]);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/devices/${deviceId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setDevice(data.device);
      } catch {
        // keep last known state on a transient network failure
      }
    }

    const id = setInterval(poll, 3 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [deviceId]);

  return { deviceId, device };
}
