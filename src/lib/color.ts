// Colour helpers for the Home page: hue/saturation (what Home Assistant's hs_color uses) and colour temperature to a displayable colour.

/** hs_color (hue 0-360, saturation 0-100) at full value to a #RRGGBB. */
export function hsToHex(h: number, s: number, v = 1): string {
  const hh = ((h % 360) + 360) % 360, ss = Math.max(0, Math.min(100, s)) / 100;
  const c = v * ss, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((q) => Math.round((q + m) * 255).toString(16).padStart(2, "0")).join("");
}
/** #RRGGBB to [hue, saturation] (0-360, 0-100). */
export function hexToHs(hex: string): [number, number] {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, mx === 0 ? 0 : (d / mx) * 100];
}
/** Colour temperature (kelvin) to an approximate colour (Tanner Helland's fit), so a warm lamp looks warm. */
export function kelvinToHex(k: number): string {
  const t = Math.max(1000, Math.min(10000, k)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return "#" + [r, g, b].map((q) => Math.round(Math.max(0, Math.min(255, q))).toString(16).padStart(2, "0")).join("");
}
type TintSource = { color?: [number, number]; kelvin?: number };
/** The colour a lit light's tile is tinted with: its own colour when it has one, else its colour temperature, else a soft warm white. */
export function tintFor(d: TintSource): string {
  if (d.color && d.color[1] > 8) return hsToHex(d.color[0], Math.min(85, d.color[1]), 1);
  if (d.kelvin) return kelvinToHex(d.kelvin);
  return "#ffd9a0";
}
export const SWATCHES: { name: string; h: number; s: number }[] = [
  { name: "Red", h: 2, s: 85 }, { name: "Orange", h: 24, s: 90 }, { name: "Amber", h: 40, s: 85 }, { name: "Green", h: 125, s: 70 }, { name: "Teal", h: 172, s: 70 }, { name: "Blue", h: 218, s: 80 }, { name: "Purple", h: 268, s: 70 }, { name: "Pink", h: 322, s: 65 },
];
/** A point in the picker (x, y as fractions 0-1 of its width/height) to hue and saturation: hue runs left to right, saturation top (full) to bottom (white). */
export const pickerToHs = (fx: number, fy: number): [number, number] => [Math.round(Math.max(0, Math.min(1, fx)) * 360), Math.round((1 - Math.max(0, Math.min(1, fy))) * 100)];
export const hsToPicker = (h: number, s: number): [number, number] => [Math.max(0, Math.min(1, h / 360)), 1 - Math.max(0, Math.min(100, s)) / 100];
