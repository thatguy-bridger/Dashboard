import type { PresetWidget } from "@/lib/presets";
import type { BackgroundConfig } from "@/lib/background";

/** Encodes an in-progress (unpublished) layout for the `?draft=` query param the live preview iframe reads. */
export function encodeDraft(widgets: PresetWidget[], background: BackgroundConfig): string {
  const json = JSON.stringify({ widgets, background });
  return btoa(unescape(encodeURIComponent(json)));
}
