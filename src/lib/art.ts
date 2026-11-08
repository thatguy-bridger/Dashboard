// Colours from the album art, worked out in the browser once per cover (a small canvas, no live blur anywhere: a live blur is too heavy for a TV stick).

const cache = new Map<string, Promise<ArtColors | null>>();
export type ArtColors = { accent: string; soft: string | null };   // accent: a vivid colour; soft: a tiny blurred picture (data URL) for the backdrop

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.decoding = "async"; i.onload = () => res(i); i.onerror = rej; i.src = url; });
}

export function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 0) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [h < 0 ? h + 360 : h, mx === 0 ? 0 : d / mx, mx];
}
export function hex(h: number, s: number, v: number) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((n) => Math.round((n + m) * 255).toString(16).padStart(2, "0")).join("");
}

/** The most prominent clearly-coloured, clearly-lit hue (12 hue buckets weighted by saturation x brightness), clamped to read on black. Null for near-greyscale art. */
export function dominantAccent(px: Uint8ClampedArray): string | null {
  const w = new Array(12).fill(0), hs = new Array(12).fill(0), ss = new Array(12).fill(0);
  for (let i = 0; i < px.length; i += 4) {
    const [h, s, v] = hsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255);
    if (s < 0.35 || v < 0.35) continue;
    const b = Math.min(11, Math.floor(h / 30)), k = s * v; w[b] += k; hs[b] += h * k; ss[b] += s * k;
  }
  let best = 0; for (let b = 1; b < 12; b++) if (w[b] > w[best]) best = b;
  if (w[best] < 4) return null;
  return hex(hs[best] / w[best], Math.max(0.55, Math.min(1, ss[best] / w[best])), 0.95);
}

export function artColors(url: string): Promise<ArtColors | null> {
  if (typeof document === "undefined" || !url) return Promise.resolve(null);
  let p = cache.get(url);
  if (!p) {
    p = load(url).then((img) => {
      const small = document.createElement("canvas"); small.width = small.height = 48;
      const sc = small.getContext("2d", { willReadFrequently: true })!; sc.drawImage(img, 0, 0, 48, 48);
      const accent = dominantAccent(sc.getImageData(0, 0, 48, 48).data);
      // the backdrop is this tiny picture stretched up: smooth, cheap, nothing blurred live
      const tiny = document.createElement("canvas"); tiny.width = tiny.height = 24;
      tiny.getContext("2d")!.drawImage(img, 0, 0, 24, 24);
      return { accent: accent ?? "", soft: tiny.toDataURL("image/jpeg", 0.8) };
    }).catch(() => null);
    if (cache.size > 40) cache.clear();
    cache.set(url, p);
  }
  return p.then((c) => (c ? { accent: c.accent, soft: c.soft } : null));
}

/** Preloads a cover so it never pops in. */
export function preload(url?: string | null) { if (url && typeof Image !== "undefined") { const i = new Image(); i.decoding = "async"; i.src = url; } }
