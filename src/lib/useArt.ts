"use client";
import { useEffect, useState } from "react";
import { artColors, preload } from "./art";

/** The cover to show: the old one stays until the new one is fully loaded, so nothing ever pops in half-drawn. */
export function useStableArt(url?: string | null) {
  const [shown, setShown] = useState<string | null>(url ?? null);
  useEffect(() => {
    if (!url) { setShown(null); return; }
    if (url === shown) return;
    let dead = false;
    const i = new Image(); i.decoding = "async";
    i.onload = () => { if (!dead) setShown(url); }; i.onerror = () => { if (!dead) setShown(url); };
    i.src = url;
    return () => { dead = true; };
  }, [url, shown]);
  return shown;
}

/** The accent and the soft backdrop worked out from the cover (null until ready, or when the browser won't let us read it). */
export function useArtColors(url?: string | null) {
  const [c, setC] = useState<{ url: string; accent: string; soft: string | null } | null>(null);
  useEffect(() => {
    if (!url) { setC(null); return; }
    let dead = false;
    artColors(url).then((r) => { if (!dead) setC(r ? { url, ...r } : null); });
    return () => { dead = true; };
  }, [url]);
  return c && c.url === url ? c : null;
}
export { preload };
