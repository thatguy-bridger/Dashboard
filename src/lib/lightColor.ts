import type { HomeEntity } from "@/lib/smarthome/types";

export const OFF_COLOR = "#3b3b44";

/** Approximate colour of a white at this temperature (kelvin) as a CSS rgb(). */
export function kelvinCss(k: number): string {
  const t = k / 100;
  const c = (n: number) => Math.round(Math.max(0, Math.min(255, n)));
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

/** The colour a light is showing right now (dark when off). */
export function lightColor(e: Pick<HomeEntity, "on" | "hs" | "colorTemp">): string {
  if (!e.on) return OFF_COLOR;
  if (e.hs) return `hsl(${Math.round(e.hs[0])} ${Math.round(e.hs[1])}% ${Math.round(50 + (100 - e.hs[1]) * 0.25)}%)`;
  if (e.colorTemp) return kelvinCss(e.colorTemp);
  return "#ffd27a";
}
