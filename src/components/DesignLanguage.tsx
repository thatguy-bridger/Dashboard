"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/useSettings";

const KEY = "hb-design";

/** Stamps the chosen design language on <html> so globals.css can restyle every screen.
 *  The last choice is cached locally so a reload doesn't flash the other look. */
export function DesignLanguage() {
  const settings = useSettings();
  useEffect(() => {
    try {
      const cached = localStorage.getItem(KEY);
      if (cached) document.documentElement.dataset.design = cached;
    } catch { /* private mode */ }
  }, []);
  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.design = settings.designLanguage;
    try { localStorage.setItem(KEY, settings.designLanguage); } catch { /* ignore */ }
  }, [settings]);
  return null;
}
