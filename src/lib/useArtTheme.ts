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
  /** average brightness of the artwork, 0 (black) to 1 (white): dark covers turn white-only lights off */
  lum: number;
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
  const fine = new Array(36).fill(0);
  const satSum = new Array(36).fill(0);
  let lumSum = 0, lumN = 0;
  let colourful = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    lumSum += 0.2126 * r + 0.7152 * g + 0.0722 * b; lumN++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max === 0 || d / max < 0.15) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const w = (d / max) * max;
    buckets[Math.floor(h / 30) % 12] += w;
    colourful += w;
    // for the lights: only clearly coloured, clearly lit pixels count (dark or grey noise must not invent a colour)
    if (max >= 0.25 && d / max >= 0.2) {
      const bi = Math.floor(h / 10) % 36;
      const pw = (d / max) * max;
      fine[bi] += pw;
      satSum[bi] += (d / max) * pw;
    }
  }

  let accent = NEUTRAL_ACCENT;
  if (colourful > 20) {
    const best = buckets.indexOf(Math.max(...buckets));
    const [r, g, b] = hsvToRgb((best * 30 + 15) / 360, 0.55, 0.95);
    // hex, so callers can append an alpha suffix ("#rrggbbaa") for glows and gradients
    accent = `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }

  // Palette for lights: the colours that are really in the artwork, no more. Hues are grouped into clusters (anything within
  // 30 degrees is the same colour, so a yellow cover with some orange stays ONE yellow). A cluster only counts if it is a
  // meaningful share of the colour in the picture, so a single-colour cover gives a single colour.
  const palette: string[] = [];
  const total = fine.reduce((a, b) => a + b, 0);
  if (colourful > 20 && total > 0) {
    const w = [...fine];
    const clusters: { weight: number; hue: number; sat: number }[] = [];
    for (let n = 0; n < 4; n++) {
      let peak = 0;
      for (let i = 1; i < 36; i++) if (w[i] > w[peak]) peak = i;
      if (w[peak] <= 0) break;
      let weight = 0, vx = 0, vy = 0, sat = 0, base = 0;
      for (let k = -3; k <= 3; k++) {
        const i = (peak + k + 36) % 36;
        const ang = ((i * 10 + 5) * Math.PI) / 180;
        weight += w[i]; vx += Math.cos(ang) * w[i]; vy += Math.sin(ang) * w[i];
        sat += satSum[i] * (w[i] / (fine[i] || 1)); base += w[i];
        w[i] = 0;
      }
      if (clusters.length && (weight < clusters[0].weight * 0.22 || weight < total * 0.07)) break;
      clusters.push({ weight, hue: ((Math.atan2(vy, vx) * 180) / Math.PI + 360) % 360, sat: base > 0 ? sat / base : 0.8 });
    }
    for (const c of clusters) {
      const [r, g, b] = hsvToRgb(c.hue / 360, Math.max(0.35, Math.min(1, c.sat * 1.1)), 1);
      palette.push(`#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`);
    }
  }

  // 240px with a ~6% blur (was 160px at ~9%): the artwork stays a little more legible.
  const blur = document.createElement("canvas");
  blur.width = blur.height = 240;
  const bctx = blur.getContext("2d")!;
  bctx.filter = "blur(13px) saturate(1.5)";
  bctx.drawImage(img, -16, -16, 272, 272);
  return { backdrop: blur.toDataURL("image/jpeg", 0.8), accent, palette, mono: palette.length === 0, lum: lumN ? lumSum / lumN : 0.5 };
}

export function useArtTheme(url: string | null | undefined): ArtTheme {
  const [theme, setTheme] = useState<ArtTheme>(
    (url && cache.get(url)) || { backdrop: null, accent: NEUTRAL_ACCENT, palette: [], mono: false, lum: 0.5 }
  );

  useEffect(() => {
    if (!url) {
      setTheme({ backdrop: null, accent: NEUTRAL_ACCENT, palette: [], mono: false, lum: 0.5 });
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
