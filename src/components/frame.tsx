"use client";
// The page frame: a strict grid with named areas (rail | header / hero / foot). Nothing is positioned over anything else, so nothing can overlap.
import type { SceneId } from "@/lib/scenes";
import type { Slots } from "@/lib/slots";
import { Icon, type IconName } from "./Icon";
import { Clock, DateLine, StripCard } from "./widgets";

/** What the header carries for each scene: the small clock and date plus the island ("full"), only the island ("island": the hero already is the clock), or nothing. */
export const HEADER_MODE: Record<SceneId, "full" | "island" | "none"> = { idle: "full", music: "full", soon: "full", day: "full", morning: "full", night: "none", away: "full", offline: "none" };
const greeting = (h: number) => (h < 5 ? "Still up?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

/** Header regions, left to right: [clock + date (+ greeting)] [the island, centred in what's left]. The island collapses its satellites first, then its text, when the header is narrow. */
export function Header({ mode, now, scene, island, lyric }: { mode: "full" | "island" | "none"; now: number; scene: SceneId; island: React.ReactNode; lyric?: React.ReactNode }) {
  if (mode === "none") return null;
  return (
    <div className="hdr">
      <div className="hdr-l" data-area="clockbox">
        {mode === "full" && (
          <>
            <Clock now={now} className="mini" />
            <div className="hdr-meta">{scene === "day" && <div className="hdr-greet" data-area="greet">{greeting(new Date(now).getHours())}</div>}<DateLine now={now} /></div>
          </>
        )}
      </div>
      <div className="hdr-c" data-area="island">{island}{lyric}</div>
    </div>
  );
}

/** The foot: the Next Up strip (or the day timeline, passed in as children) and a corner peek, side by side. */
export function Foot({ slots, children, showStrip, lights }: { slots: Slots; children?: React.ReactNode; showStrip: boolean; lights?: React.ReactNode }) {
  const main = children ?? (showStrip && slots.strip.length ? <div className="strip-row">{slots.strip.map((s) => <StripCard key={s.id} item={s} />)}</div> : null);
  if (!main && !slots.peek && !lights) return null;
  return (
    <>
    {lights}
    <div className="foot-row">
      <div className="foot-main" data-area="footmain">{main}</div>
      {slots.peek && <div className="peek" key={slots.peek.id} data-area="peek">{slots.peek.icon && <Icon name={slots.peek.icon as IconName} />}<span className="fit">{slots.peek.title}</span></div>}
    </div>
    </>
  );
}
