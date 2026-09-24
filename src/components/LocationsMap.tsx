"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// CARTO's free, no-key vector basemap — we retint it below to match the
// dashboard's own palette instead of using its default dark theme as-is.
const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

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

function markerElement(device: MapDevice): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = "16px";
  el.style.height = "16px";
  el.style.borderRadius = "9999px";
  const color = device.isOld ? MUTED : ACCENT_GLOW;
  el.style.background = `radial-gradient(circle at 35% 35%, ${color}, transparent 70%)`;
  el.style.boxShadow = `0 0 16px 5px ${color}55`;
  el.style.border = `1.5px solid ${color}`;
  el.style.cursor = "pointer";
  return el;
}

export function LocationsMap({ devices, heightClass }: { devices: MapDevice[]; heightClass: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [0, 20],
      zoom: 1,
      attributionControl: { compact: true },
    });
    map.scrollZoom.disable();
    map.dragRotate.disable();
    map.on("style.load", () => restyle(map));
    mapRef.current = map;

    return () => {
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
        const marker = new maplibregl.Marker({ element: markerElement(d) })
          .setLngLat([d.longitude, d.latitude])
          .setPopup(
            new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(
              `<div style="font:12px system-ui;color:#f2f4f8;background:#0b0d12;padding:2px 4px;">
                 <strong>${d.name}</strong>${
                   d.batteryLevel != null ? `<br/>${Math.round(d.batteryLevel * 100)}% battery` : ""
                 }
               </div>`
            )
          )
          .addTo(map!);
        markersRef.current.push(marker);
        bounds.extend([d.longitude, d.latitude]);
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
      ref={containerRef}
      className={`${heightClass} w-full max-w-lg rounded-xl overflow-hidden border border-[var(--surface-border)]`}
    />
  );
}
