"use client";
import { lightsView } from "@/lib/lights";
import type { LightsState } from "@/lib/types";

/** The music-lights indicator: one quiet line. Hidden when the lights switch is off. Colours fade slowly (CSS), nothing else moves. */
export function LightsRow({ lights, palette }: { lights: LightsState | null | undefined; palette?: string[] }) {
  const chips = lightsView(lights);
  if (!chips) return null;
  const dots = (palette ?? []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 4);
  return (
    <div className="lightsrow" aria-label="Music lights">
      <span className="lr-label">Music lights</span>
      {dots.length > 0 && <span className="lr-dots">{dots.map((c, i) => <i key={i} style={{ background: c }} />)}</span>}
      <span className="lr-chips">{chips.map((l) => <span key={l.id} className="lr-chip"><i style={{ background: l.color }} /><span className="fit">{l.name}</span></span>)}</span>
    </div>
  );
}
