"use client";
import { useEffect, useState } from "react";
import { forecastUrl, parseForecast, type Forecast } from "./forecast";

export function useForecast(loc?: { lat: number; lon: number } | null) {
  const [f, setF] = useState<Forecast | null>(null);
  useEffect(() => {
    if (!loc) return;
    let dead = false;
    const load = async () => { try { const r = await fetch(forecastUrl(loc.lat, loc.lon)); if (r.ok && !dead) setF(parseForecast(await r.json())); } catch { /* keep the last one */ } };
    load(); const id = setInterval(load, 600000);
    return () => { dead = true; clearInterval(id); };
  }, [loc?.lat, loc?.lon]);   // eslint-disable-line react-hooks/exhaustive-deps
  return f;
}

