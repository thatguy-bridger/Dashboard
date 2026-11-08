"use client";
// The page frame: a strict grid with named areas (rail | header / hero / foot). Nothing is positioned over anything else, so nothing can overlap.
import type { SceneId } from "@/lib/scenes";
import type { SlotItem, Slots } from "@/lib/slots";
import { Icon, type IconName } from "./Icon";
import { Clock, DateLine, SlotPill, StripCard } from "./widgets";

/** What the header carries for each scene: the small clock and date ("full"), only the pills ("pills": the hero already is the clock), or nothing. */
export const HEADER_MODE: Record<SceneId, "full" | "pills" | "none"> = { idle: "pills", music: "full", soon: "full", day: "full", morning: "pills", night: "none", away: "pills", offline: "none" };
const greeting = (h: number) => (h < 5 ? "Still up?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

/** Header regions, left to right: [clock + date (+ greeting)] [pills]. The pills shrink (their titles shorten) before they can touch the clock; when the header is narrow the greeting goes first, then the second pill. */
export function Header({ mode, now, scene, pills }: { mode: "full" | "pills" | "none"; now: number; scene: SceneId; pills: SlotItem[] }) {
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
      <div className="hdr-r" data-area="pills">{pills.map((p) => <SlotPill key={p.id} item={p} />)}</div>
    </div>
  );
}

/** The foot: the Next Up strip (or the day timeline, passed in as children) and a corner peek, side by side. */
export function Foot({ slots, children, showStrip }: { slots: Slots; children?: React.ReactNode; showStrip: boolean }) {
  const main = children ?? (showStrip && slots.strip.length ? <div className="strip-row">{slots.strip.map((s) => <StripCard key={s.id} item={s} />)}</div> : null);
  if (!main && !slots.peek) return null;
  return (
    <div className="foot-row">
      <div className="foot-main" data-area="footmain">{main}</div>
      {slots.peek && <div className="peek" key={slots.peek.id} data-area="peek">{slots.peek.icon && <Icon name={slots.peek.icon as IconName} />}<span className="fit">{slots.peek.title}</span></div>}
    </div>
  );
}
