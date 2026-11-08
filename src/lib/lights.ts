// The music-lights indicator: state:lights = { "on": true, "lights": [{ "id": "light.x", "name": "Light bar 1", "mode": "art"|"white"|"off"|"leave", "color": "#RRGGBB" }] }
import type { LightsState } from "./types.ts";

const HEX = /^#[0-9a-fA-F]{6}$/;
export type LightChip = { id: string; name: string; mode: "art" | "white"; color: string };

/** The lights to show: only when the switch is on, and only the ones that are following the art or set to white. Null hides the whole row. */
export function lightsView(raw: LightsState | null | undefined): LightChip[] | null {
  if (!raw || raw.on !== true || !Array.isArray(raw.lights)) return null;
  const out: LightChip[] = [];
  for (const l of raw.lights) {
    if (!l || typeof l.id !== "string" || typeof l.name !== "string") continue;
    if (l.mode !== "art" && l.mode !== "white") continue;
    out.push({ id: l.id, name: l.name.slice(0, 28), mode: l.mode, color: typeof l.color === "string" && HEX.test(l.color) ? l.color : "#ece9e4" });
  }
  return out.length ? out : null;
}
