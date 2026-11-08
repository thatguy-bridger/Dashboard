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

const FONTS: Record<Theme["font"], string> = {
  default: `-apple-system, "SF Pro Display", "Helvetica Neue", system-ui, sans-serif`,
  rounded: `ui-rounded, "SF Pro Rounded", -apple-system, system-ui, sans-serif`,
  serif: `ui-serif, "New York", "Iowan Old Style", Georgia, serif`,
  mono: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`,
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
    "--accent": a, "--font": FONTS[t.font], "--rs": String(t.radius),
    "--fg": "#ece9e4", "--fg2": "rgba(236,233,228,.6)", "--fg3": "rgba(236,233,228,.38)", "--bg": "#0f0e13",
    "--glass-a": String((0.05 + g * 0.07).toFixed(3)), "--glass-b": String((0.025 + g * 0.035).toFixed(3)), "--edge": `rgba(255,255,255,${(0.03 + g * 0.04).toFixed(3)})`, "--on-accent": "#17151c",
  } : {
    "--accent": a, "--font": FONTS[t.font], "--rs": String(t.radius),
    "--fg": "#2a2730", "--fg2": "rgba(42,39,48,.6)", "--fg3": "rgba(42,39,48,.4)", "--bg": "#f4f1ec",
    "--glass-a": String(0.55 + g * 0.3), "--glass-b": String(0.35 + g * 0.3), "--edge": `rgba(20,22,28,${(0.06 + g * 0.08).toFixed(3)})`, "--on-accent": "#ffffff",
  };
}
