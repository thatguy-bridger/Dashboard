"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "home-base:device-id";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Returns this browser's permanent device tag, creating one on first load.
 * The id lives in localStorage, so reloads/restarts never re-register the device.
 */
export function useDeviceId(): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    let existing = window.localStorage.getItem(STORAGE_KEY);
    if (!existing) {
      existing = generateId();
      window.localStorage.setItem(STORAGE_KEY, existing);
    }
    setId(existing);
  }, []);

  return id;
}
