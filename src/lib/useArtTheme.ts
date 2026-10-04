"use client";

import { useEffect, useState } from "react";

export interface ArtTheme {
  /** Pre-blurred 160px data URL, shown scaled up — computed once per song. */
  backdrop: string | null;
  /** Vivid accent that reads on black. */
  accent: string;
}

export const NEUTRAL_ACCENT = "#f0b38a";
const cache = new Map<string, ArtTheme>();

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
  let colourful = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max === 0 || d / max < 0.15) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const w = (d / max) * max;
    buckets[Math.floor(h / 30) % 12] += w;
    colourful += w;
  }

  let accent = NEUTRAL_ACCENT;
  if (colourful > 20) {
    const best = buckets.indexOf(Math.max(...buckets));
    const [r, g, b] = hsvToRgb((best * 30 + 15) / 360, 0.55, 0.95);
    accent = `rgb(${r}, ${g}, ${b})`;
  }

  const blur = document.createElement("canvas");
  blur.width = blur.height = 160;
  const bctx = blur.getContext("2d")!;
  bctx.filter = "blur(14px) saturate(1.5)";
  bctx.drawImage(small, -20, -20, 200, 200);
  return { backdrop: blur.toDataURL("image/jpeg", 0.8), accent };
}

export function useArtTheme(url: string | null | undefined): ArtTheme {
  const [theme, setTheme] = useState<ArtTheme>(
    (url && cache.get(url)) || { backdrop: null, accent: NEUTRAL_ACCENT }
  );

  useEffect(() => {
    if (!url) {
      setTheme({ backdrop: null, accent: NEUTRAL_ACCENT });
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
