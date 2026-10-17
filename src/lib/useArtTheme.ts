"use client";

import { useEffect, useState } from "react";
import { NEUTRAL_ACCENT, analysePixels } from "@/lib/palette";

export interface ArtTheme {
  /** Pre-blurred 160px data URL, shown scaled up — computed once per song. */
  backdrop: string | null;
  /** Vivid accent that reads on black. */
  accent: string;
  /** Up to four distinct, vivid colours from the artwork (hex), most dominant first: for lights. */
  palette: string[];
  /** the artwork was analysed and has no real colour (black and white): lights should go white */
  mono: boolean;
  /** the artwork this theme was made from (so a stale theme is never applied to another song) */
  url: string | null;
  /** average brightness of the artwork, 0 (black) to 1 (white): dark covers turn white-only lights off */
  lum: number;
}

export { NEUTRAL_ACCENT };
const cache = new Map<string, ArtTheme>();

/** The screen's look for an artwork: the shared colour analysis plus a pre-blurred backdrop. */
function analyse(img: HTMLImageElement): ArtTheme {
  const small = document.createElement("canvas");
  small.width = small.height = 160;
  const sctx = small.getContext("2d")!;
  sctx.drawImage(img, 0, 0, 160, 160);
  const { accent, palette, mono, lum } = analysePixels(sctx.getImageData(0, 0, 160, 160).data);

  // 240px with a ~6% blur (was 160px at ~9%): the artwork stays a little more legible.
  const blur = document.createElement("canvas");
  blur.width = blur.height = 240;
  const bctx = blur.getContext("2d")!;
  bctx.filter = "blur(13px) saturate(1.5)";
  bctx.drawImage(img, -16, -16, 272, 272);
  return { backdrop: blur.toDataURL("image/jpeg", 0.8), accent, palette, mono, lum, url: null };
}

export function useArtTheme(url: string | null | undefined): ArtTheme {
  const [theme, setTheme] = useState<ArtTheme>(
    (url && cache.get(url)) || { backdrop: null, accent: NEUTRAL_ACCENT, palette: [], mono: false, lum: 0.5, url: null }
  );

  useEffect(() => {
    if (!url) {
      setTheme({ backdrop: null, accent: NEUTRAL_ACCENT, palette: [], mono: false, lum: 0.5, url: null });
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
        const t = { ...analyse(img), url };
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
