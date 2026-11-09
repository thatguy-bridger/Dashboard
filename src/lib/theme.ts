import { rgbVar } from "./color";
// Theme tokens pushed by Permuta (config:theme) so the page can look like the app. Everything has a default; unknown fields are ignored.

export type ThemeConfig = {
  accent?: string;                                  // "#RRGGBB"
  font?: "default" | "rounded" | "serif" | "mono";
  glass?: number;                                   // 0 flat … 1 strong glass
  radius?: number;                                  // corner scale, 0.4 square … 1.6 pill-ish (1 = normal)
  dark?: boolean;                                   // false = a light display
  artAccent?: boolean;                              // tint the accent from the album art while music plays
};
export type Theme = Required<ThemeConfig>;

export const THEME_DEFAULTS: Theme = { accent: "#7c8cff", font: "rounded", glass: 0.5, radius: 1, dark: true, artAccent: true };

const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export function resolveTheme(c?: ThemeConfig | null, legacyAccent?: string): Theme {
  const o = c ?? {};
  return {
    accent: hex(o.accent, hex(legacyAccent, THEME_DEFAULTS.accent)),
    font: (["default", "rounded", "serif", "mono"] as const).includes(o.font as never) ? (o.font as Theme["font"]) : THEME_DEFAULTS.font,
    glass: num(o.glass, THEME_DEFAULTS.glass, 0, 1), radius: num(o.radius, THEME_DEFAULTS.radius, 0.4, 1.6),
    dark: typeof o.dark === "boolean" ? o.dark : THEME_DEFAULTS.dark, artAccent: typeof o.artAccent === "boolean" ? o.artAccent : THEME_DEFAULTS.artAccent,
  };
}

// "rounded" (the default) is the calm pairing loaded with next/font in src/app/layout.tsx: --nf-text for words, --nf-num for numerals (tabular figures).
// The other options use system faces only. Fire TV has no SF, so every stack ends in plain sans-serif / serif / monospace.
const SANS = `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const FONTS: Record<Theme["font"], { text: string; num: string }> = {
  default: { text: SANS, num: SANS },
  rounded: { text: `var(--nf-text), ui-rounded, "SF Pro Rounded", ${SANS}`, num: `var(--nf-num), ui-rounded, "SF Pro Rounded", ${SANS}` },
  serif: { text: `ui-serif, "New York", Georgia, "Times New Roman", serif`, num: `ui-serif, "New York", Georgia, "Times New Roman", serif` },
  mono: { text: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`, num: `ui-monospace, "SF Mono", Menlo, Consolas, monospace` },
};

/** A gentler version of a colour: a little less saturated, a little lighter. Used for the accent so it never glares. */
export function soften(hex: string, amount = 0.26): string {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = ((h * 60) + 360) % 360;
  const s = (mx === 0 ? 0 : d / mx) * (1 - amount), v = Math.min(1, mx + (1 - mx) * 0.14);
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [rr, gg, bb].map((q) => Math.round((q + m) * 255).toString(16).padStart(2, "0")).join("");
}

/** CSS custom properties for the theme. `accent` may be overridden by the art colour. */
export function cssVars(t: Theme, accent?: string | null): Record<string, string> {
  const a = soften((t.artAccent && accent) || t.accent);
  const g = t.glass;
  return t.dark ? {
    "--accent": a, "--accent-rgb": rgbVar(a), "--bg-rgb": "15, 14, 19", "--font": FONTS[t.font].text, "--font-num": FONTS[t.font].num, "--rs": String(t.radius),
    "--fg": "#ece9e4", "--fg2": "rgba(236,233,228,.6)", "--fg3": "rgba(236,233,228,.38)", "--bg": "#0f0e13",
    "--glass-a": String((0.05 + g * 0.07).toFixed(3)), "--glass-b": String((0.025 + g * 0.035).toFixed(3)), "--edge": `rgba(255,255,255,${(0.03 + g * 0.04).toFixed(3)})`, "--on-accent": "#17151c",
  } : {
    "--accent": a, "--accent-rgb": rgbVar(a), "--bg-rgb": "244, 241, 236", "--font": FONTS[t.font].text, "--font-num": FONTS[t.font].num, "--rs": String(t.radius),
    "--fg": "#2a2730", "--fg2": "rgba(42,39,48,.6)", "--fg3": "rgba(42,39,48,.4)", "--bg": "#f4f1ec",
    "--glass-a": String(0.55 + g * 0.3), "--glass-b": String(0.35 + g * 0.3), "--edge": `rgba(20,22,28,${(0.06 + g * 0.08).toFixed(3)})`, "--on-accent": "#ffffff",
  };
}

const rgb = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
/** Mix two colours (t = 0 gives a, 1 gives b). */
export const mix = (a: string, b: string, t: number) => { const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b); return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t); };
/** Relative luminance 0 to 1 (WCAG). */
export const luminance = (hex: string) => { const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = rgb(hex); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

const HEXC = /^#[0-9a-fA-F]{6}$/;
/** A soft gradient for the song title from the colours affecting the song (the same ones the lights use). Each colour is softened and lightened until it reads on the dark backdrop. */
export function titleGradient(palette: string[] | undefined | null, fallback: string, angle = 100): string {
  const cols = (palette ?? []).filter((c) => typeof c === "string" && HEXC.test(c)).slice(0, 4);
  const base = cols.length ? cols : [fallback];
  const lit = base.map((c) => { let x = soften(c, 0.22); for (let i = 0; i < 6 && luminance(x) < 0.38; i++) x = mix(x, "#ffffff", 0.18); return mix(x, "#ece9e4", 0.12); });
  if (lit.length === 1) lit.push(mix(lit[0], "#ece9e4", 0.45));       // one colour: fade it toward the text colour so it's still a gentle gradient
  return `linear-gradient(${angle}deg, ${lit.join(", ")})`;
}
