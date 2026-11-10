"use client";
// The weather map: a dark, Apple-Maps-like base map with the real radar (RainViewer, animated) and wind arrows from the forecast model across the area.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

type Frame = { time: number; path: string };

export function WeatherMap({ lat, lon }: { lat: number; lon: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [radar, setRadar] = useState(true), [wind, setWind] = useState(true);
  const state = useRef<{ L?: typeof import("leaflet"); map?: import("leaflet").Map; radar?: import("leaflet").LayerGroup; wind?: import("leaflet").LayerGroup }>({});
  const [stamp, setStamp] = useState("");

  // the map itself
  useEffect(() => {
    let dead = false;
    (async () => {
      const L = await import("leaflet");
      if (dead || !box.current) return;
      const map = L.map(box.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, dragging: false, doubleClickZoom: false, touchZoom: false, keyboard: false, zoomSnap: 0.5 }).setView([lat, lon], 7);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxNativeZoom: 16, maxZoom: 12 }).addTo(map);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxNativeZoom: 16, maxZoom: 12, pane: "shadowPane" }).addTo(map);
      L.control.attribution({ prefix: false, position: "bottomright" }).addAttribution("Esri · radar RainViewer · wind Open-Meteo").addTo(map);
      const home = L.divIcon({ className: "wm-home", html: "<i></i>", iconSize: [18, 18] });
      L.marker([lat, lon], { icon: home, interactive: false }).addTo(map);
      state.current = { L, map, radar: L.layerGroup().addTo(map), wind: L.layerGroup().addTo(map) };
      setTimeout(() => map.invalidateSize(), 100);
    })();
    return () => { dead = true; state.current.map?.remove(); state.current = {}; };
  }, [lat, lon]);

  // radar frames, looping
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined, refresh: ReturnType<typeof setInterval> | undefined, dead = false;
    const load = async () => {
      const s = state.current; if (!s.L || !s.radar) return;
      s.radar.clearLayers();
      if (!radar) { setStamp(""); return; }
      try {
        const j = await (await fetch("https://api.rainviewer.com/public/weather-maps.json")).json();
        const frames: Frame[] = [...(j.radar?.past ?? []), ...(j.radar?.nowcast ?? [])].slice(-10);
        if (dead || !frames.length) return;
        const layers = frames.map((f) => s.L!.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/6/1_1.png`, { opacity: 0, maxNativeZoom: 7, maxZoom: 12 }).addTo(s.radar!));
        let i = frames.length - 1;
        const show = () => { layers.forEach((l, k) => l.setOpacity(k === i ? 0.7 : 0)); setStamp(new Date(frames[i].time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (frames[i].time * 1000 > Date.now() ? " forecast" : "")); };
        show();
        timer = setInterval(() => { i = (i + 1) % frames.length; show(); }, i === frames.length - 1 ? 700 : 700);
      } catch { /* the base map still works */ }
    };
    const wait = setInterval(() => { if (state.current.radar) { clearInterval(wait); load(); refresh = setInterval(() => { if (timer) clearInterval(timer); load(); }, 600000); } }, 200);
    return () => { dead = true; clearInterval(wait); if (timer) clearInterval(timer); if (refresh) clearInterval(refresh); };
  }, [radar, lat, lon]);

  // wind arrows on a grid
  useEffect(() => {
    let dead = false, refresh: ReturnType<typeof setInterval> | undefined;
    const draw = async () => {
      const s = state.current; if (!s.L || !s.wind) return;
      s.wind.clearLayers();
      if (!wind) return;
      const pts: [number, number][] = [];
      for (let r = -1; r <= 1; r++) for (let c = -2; c <= 2; c++) pts.push([lat + r * 1.05, lon + c * 1.45]);
      try {
        const u = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map((p) => p[0].toFixed(2)).join(",")}&longitude=${pts.map((p) => p[1].toFixed(2)).join(",")}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=mph`;
        const arr = await (await fetch(u)).json();
        if (dead) return;
        (Array.isArray(arr) ? arr : [arr]).forEach((o: { latitude: number; longitude: number; current?: { wind_speed_10m: number; wind_direction_10m: number } }) => {
          const c = o.current; if (!c) return;
          const sp = Math.round(c.wind_speed_10m), rot = (c.wind_direction_10m + 180) % 360;       // the arrow points where the wind is going
          const icon = s.L!.divIcon({ className: "wm-wind", iconSize: [44, 44], html: `<div class="wm-arrow" style="transform:rotate(${rot}deg)"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 3 L18 15 L12 12.5 L6 15 Z" fill="currentColor"/></svg></div><b>${sp}</b>` });
          s.L!.marker([o.latitude, o.longitude], { icon, interactive: false }).addTo(s.wind!);
        });
      } catch { /* none */ }
    };
    const wait = setInterval(() => { if (state.current.wind) { clearInterval(wait); draw(); refresh = setInterval(draw, 900000); } }, 200);
    return () => { dead = true; clearInterval(wait); if (refresh) clearInterval(refresh); };
  }, [wind, lat, lon]);

  return (
    <div className="wmap">
      <div ref={box} className="wmap-box" />
      <div className="wmap-tools">
        <button className={radar ? "on" : ""} onClick={() => setRadar(!radar)}>Radar</button>
        <button className={wind ? "on" : ""} onClick={() => setWind(!wind)}>Wind</button>
      </div>
      {stamp && <div className="wmap-stamp">{stamp}</div>}
    </div>
  );
}
