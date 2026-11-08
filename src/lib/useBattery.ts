"use client";
import { useEffect, useState } from "react";
import { fromManager, type Bat } from "./battery";

type Manager = EventTarget & { level: number; charging: boolean };
/** This device's own battery, where the browser has navigator.getBattery (Chrome and Android Silk do; Safari and Firefox don't, and then there is simply no data). */
export function useBattery(): Bat | null {
  const [bat, setBat] = useState<Bat | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<Manager> };
    if (typeof nav.getBattery !== "function") return;
    let gone = false, m: Manager | null = null;
    const read = () => { if (!gone && m) setBat(fromManager(m)); };
    nav.getBattery().then((b) => { m = b; read(); for (const e of ["levelchange", "chargingchange"]) b.addEventListener(e, read); }).catch(() => {});
    return () => { gone = true; if (m) for (const e of ["levelchange", "chargingchange"]) m.removeEventListener(e, read); };
  }, []);
  return bat;
}
