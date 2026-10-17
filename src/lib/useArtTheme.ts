"use client";

import { useEffect, useState } from "react";

export interface ArtTheme {
  /** Pre-blurred 160px data URL, shown scaled up — computed once per song. */
  backdrop: string | null;
  /** Vivid accent that reads on black. */
  accent: string;
  /** Up to three distinct, vivid colours from the artwork (hex), most dominant first: for lights. */
  palette: string[];
  /** the artwork was analysed and has no real colour (black and white): lights should go white */
  mono: boolean;
}

export const NEUTRAL_ACCENT = "#f0b38a";
const cache = new Map<string, ArtTheme>();

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60 + 360) % 360) / 360, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)].map((x) => Math.round(x * 255)) as [number, number, number];
}

/** 12-bucket hue histogram weighted by saturation x brightness, then clamped
 *  to s>=0.45, v>=0.85 so it reads on black (Islet DESIGN.md section 4). */
function analyse(img: HTMLImageElement): ArtTheme {
  const small = document.createElement("canvas");
  small.width = small.height = 160;
  const sctx = small.getContext("2d")!;
  sctx.drawImage(img, 0, 0, 160, 160);
  const { data } = sctx.getImageData(0, 0, 160, 160);

  const buckets = new Array(12).fill(0);
  const fine = new Array(24).fill(0);
  const sums = Array.from({ length: 24 }, () => [0, 0, 0, 0]); // weighted r,g,b and weight, per 15-degree hue bucket
  let colourful = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max === 0 || d / max < 0.15) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const w = (d / max) * max;
    const bi = Math.floor(h / 15) % 24;
    fine[bi] += w;
    buckets[Math.floor(h / 30) % 12] += w;
    sums[bi][0] += r * w; sums[bi][1] += g * w; sums[bi][2] += b * w; sums[bi][3] += w;
    colourful += w;
  }

  let accent = NEUTRAL_ACCENT;
  if (colourful > 20) {
    const best = buckets.indexOf(Math.max(...buckets));
    const [r, g, b] = hsvToRgb((best * 30 + 15) / 360, 0.55, 0.95);
    // hex, so callers can append an alpha suffix ("#rrggbbaa") for glows and gradients
    accent = `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }

  // Palette for lights: up to six colours. Take the strongest 15-degree hue buckets that are at least 30 degrees apart,
  // each the weighted average colour of its pixels pushed to full vividness (bulbs wash out pale colours).
  const palette: string[] = [];
  if (colourful > 20) {
    const order = fine.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]);
    const picked: number[] = [];
    for (const [w, i] of order) {
      if (picked.length >= 6 || w < order[0][0] * 0.04 || sums[i][3] === 0) break;
      const far = picked.every((p) => Math.min(Math.abs(p - i), 24 - Math.abs(p - i)) >= 2);
      if (!far) continue;
      picked.push(i);
      const [sr, sg, sb, sw] = sums[i];
      const [hh, ss] = rgbToHsv(sr / sw, sg / sw, sb / sw);
      const [r, g, b] = hsvToRgb(hh, Math.max(0.7, Math.min(1, ss * 1.15)), 1);
      palette.push(`#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`);
    }
  }

  // 240px with a ~6% blur (was 160px at ~9%): the artwork stays a little more legible.
  const blur = document.createElement("canvas");
  blur.width = blur.height = 240;
  const bctx = blur.getContext("2d")!;
  bctx.filter = "blur(13px) saturate(1.5)";
  bctx.drawImage(img, -16, -16, 272, 272);
  return { backdrop: blur.toDataURL("image/jpeg", 0.8), accent, palette, mono: palette.length === 0 };
}

export function useArtTheme(url: string | null | undefined): ArtTheme {
  const [theme, setTheme] = useState<ArtTheme>(
    (url && cache.get(url)) || { backdrop: null, accent: NEUTRAL_ACCENT, palette: [], mono: false }
  );

  useEffect(() => {
    if (!url) {
      setTheme({ backdrop: null, accent: NEUTRAL_ACCENT, palette: [], mono: false });
      return;
    }
    const hit = cache.get(url);
    if (hit) {
      setTheme(hit);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const t = analyse(img);
        cache.set(url, t);
        if (!cancelled) setTheme(t);
      } catch {
        // tainted canvas: keep the neutral look
      }
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return theme;
}
