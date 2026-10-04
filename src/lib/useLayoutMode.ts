"use client";

import { useSettings } from "@/lib/useSettings";
import type { LayoutMode } from "@/lib/settings";

/** null until the first load, so screens don't flash the wrong layout. */
export function useLayoutMode(): LayoutMode | null {
  return useSettings()?.layoutMode ?? null;
}
