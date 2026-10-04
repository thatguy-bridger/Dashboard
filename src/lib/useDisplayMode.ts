"use client";

import { useSettings } from "@/lib/useSettings";
import type { DisplayMode } from "@/lib/settings";

/** "Color" is the flat/minimal look every widget already had; "image" opts
 * individual widgets into real photos/logos/atmospheric effects where they
 * have something to show — set once for the whole app in Control, not
 * per-widget, since it's a visual mode rather than a per-tile setting. */
export function useDisplayMode(): DisplayMode {
  return useSettings()?.displayMode ?? "color";
}
