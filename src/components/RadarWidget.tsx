import type { WidgetSize } from "@/lib/presets";

// Same default placeholder location as /api/weather until per-device
// location is configurable.
const DEFAULT_LAT = 40.7128;
const DEFAULT_LON = -74.006;

/** Windy's free embeddable radar map — no key, no account, just an iframe.
 * Building a tile-compositing radar renderer from scratch (RainViewer's raw
 * tile API) would be a lot of extra work for the same result. */
export function RadarWidget({ size = "md" }: { size?: WidgetSize }) {
  const zoom = size === "sm" || size === "md" ? 6 : 7;
  const src = `https://embed.windy.com/embed2.html?lat=${DEFAULT_LAT}&lon=${DEFAULT_LON}&zoom=${zoom}&overlay=radar&product=radar&menu=&message=&marker=&calendar=&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;

  return (
    <iframe
      src={src}
      className="w-full h-full rounded-[inherit] border-0"
      title="Weather radar"
      loading="lazy"
    />
  );
}
