"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// CARTO's free, no-key vector basemap — we retint it below to match the
// dashboard's own palette instead of using its default dark theme as-is.
const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// v6's tile-processing worker is a real ES module that imports a sibling
// file by a relative path; Next.js (Turbopack and webpack alike) doesn't
// resolve that pair correctly when left to auto-detect it from inside
// node_modules, silently producing "Worker failed to load". Both files are
// copied to /public by scripts/copy-maplibre-worker.js (on postinstall) and
// served same-origin instead.
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

const ACCENT_GLOW = "#38bdf8";
const BACKGROUND = "#0b0d12";
const MUTED = "#8b93a7";

interface MapDevice {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  batteryLevel: number | null;
  isOld: boolean;
}

/** Retints CARTO's stock dark style to the dashboard's own background/accent
 * colors so the map reads as part of the same system, not an embedded widget. */
function restyle(map: maplibregl.Map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (layer.type === "background") {
      map.setPaintProperty(layer.id, "background-color", BACKGROUND);
    } else if (layer.type === "fill" && /water/i.test(layer.id)) {
      map.setPaintProperty(layer.id, "fill-color", "#111826");
    } else if (layer.type === "line" && /(road|street|highway)/i.test(layer.id)) {
      map.setPaintProperty(layer.id, "line-color", "#1c2333");
    } else if (layer.type === "fill" && /(park|landuse|landcover)/i.test(layer.id)) {
      map.setPaintProperty(layer.id, "fill-color", "#0f1420");
    } else if (layer.type === "symbol") {
      if (map.getLayoutProperty(layer.id, "text-field") !== undefined) {
        map.setPaintProperty(layer.id, "text-color", MUTED);
        map.setPaintProperty(layer.id, "text-halo-color", BACKGROUND);
        map.setPaintProperty(layer.id, "text-halo-width", 1);
      }
    }
  }
}

function dotElement(device: MapDevice): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "14px";
  el.style.height = "14px";
  el.style.borderRadius = "9999px";
  const color = device.isOld ? MUTED : ACCENT_GLOW;
  el.style.background = `radial-gradient(circle at 35% 35%, ${color}, transparent 70%)`;
  el.style.boxShadow = `0 0 16px 5px ${color}55`;
  el.style.border = `1.5px solid ${color}`;
  return el;
}

// A small always-on glass-panel tag next to each dot — this map is a
// glanceable display, not something a viewer taps through, so the label
// is always visible rather than hidden behind a click/hover popup.
function cardElement(device: MapDevice): HTMLDivElement {
  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.gap = "1px";
  el.style.padding = "4px 8px";
  el.style.borderRadius = "10px";
  el.style.background = "rgba(11, 13, 18, 0.72)";
  el.style.border = "1px solid rgba(255, 255, 255, 0.12)";
  el.style.backdropFilter = "blur(8px)";
  (el.style as CSSStyleDeclaration & { WebkitBackdropFilter?: string }).WebkitBackdropFilter = "blur(8px)";
  el.style.whiteSpace = "nowrap";
  el.style.pointerEvents = "none";
  el.style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.35)";

  const name = document.createElement("div");
  name.textContent = device.name;
  name.style.font = "600 11px system-ui, sans-serif";
  name.style.color = "#f2f4f8";
  el.appendChild(name);

  if (device.batteryLevel != null || device.isOld) {
    const sub = document.createElement("div");
    const parts = [];
    if (device.batteryLevel != null) parts.push(`${Math.round(device.batteryLevel * 100)}%`);
    if (device.isOld) parts.push("stale");
    sub.textContent = parts.join(" · ");
    sub.style.font = "10px system-ui, sans-serif";
    sub.style.color = MUTED;
    el.appendChild(sub);
  }

  return el;
}

export function LocationsMap({ devices, heightClass }: { devices: MapDevice[]; heightClass: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tilesLoaded, setTilesLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: [0, 20],
        zoom: 1,
        // The stock control renders as an expandable white "i" button that
        // doesn't match this app anywhere else — CARTO's free tier still
        // requires attribution, so it's replaced below with a plain, tiny,
        // dark-styled text line instead of dropping it.
        attributionControl: false,
      });
    } catch (e) {
      queueMicrotask(() => setError(String(e)));
      return;
    }

    map.scrollZoom.disable();
    map.dragRotate.disable();
    map.on("style.load", () => restyle(map));
    map.on("idle", () => setTilesLoaded(true));
    map.on("error", (e) => setError(e.error?.message ?? String(e.error ?? "unknown map error")));
    mapRef.current = map;

    // A widget tile can mount before its grid cell has its final size
    // (e.g. right after a preset publish); without this the map's canvas
    // can get stuck sized at whatever the container was at construction.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function placeMarkers() {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      if (devices.length === 0) return;

      const bounds = new maplibregl.LngLatBounds();
      for (const d of devices) {
        const lngLat: [number, number] = [d.longitude, d.latitude];

        const dot = new maplibregl.Marker({ element: dotElement(d) }).setLngLat(lngLat).addTo(map!);
        // A second marker, offset to the dot's right, carries the label —
        // markers stay screen-space-sized and correctly placed at any zoom,
        // which a plain absolutely-positioned overlay wouldn't.
        const card = new maplibregl.Marker({ element: cardElement(d), anchor: "left", offset: [10, 0] })
          .setLngLat(lngLat)
          .addTo(map!);

        markersRef.current.push(dot, card);
        bounds.extend(lngLat);
      }

      if (devices.length === 1) {
        map!.jumpTo({ center: [devices[0].longitude, devices[0].latitude], zoom: 12 });
      } else {
        map!.fitBounds(bounds, { padding: 48, maxZoom: 12, animate: false });
      }
    }

    if (map.isStyleLoaded()) placeMarkers();
    else map.once("load", placeMarkers);
  }, [devices]);

  return (
    <div
      className={`${heightClass} w-full max-w-lg rounded-xl overflow-hidden border border-[var(--surface-border)] relative`}
    >
      <div ref={containerRef} className="h-full w-full" />
      {!error && !tilesLoaded && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)] pointer-events-none">
          Loading map…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-[var(--muted)] pointer-events-none">
          Map failed to load: {error}
        </div>
      )}
      <div className="absolute bottom-1 right-2 text-[9px] text-[var(--muted)] opacity-60 pointer-events-none select-none">
        © CARTO, © OpenStreetMap
      </div>
    </div>
  );
}
