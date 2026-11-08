"use client";
import type { Slots } from "@/lib/slots";
import { Icon, type IconName } from "./Icon";
import { SlotPill, StripCard } from "./widgets";

/** The fixed zones of focus mode, drawn over the hero: top pills, the bottom strip, a corner peek. (Rail badges live on the rail; takeover is below.) */
export function Zones({ slots }: { slots: Slots }) {
  return (
    <>
      {slots.pills.length > 0 && <div className="zone-top">{slots.pills.map((p) => <SlotPill key={p.id} item={p} />)}</div>}
      {slots.strip.length > 0 && <div className="zone-bottom"><div className="strip-row">{slots.strip.map((s) => <StripCard key={s.id} item={s} />)}</div></div>}
      {slots.peek && <div className="zone-peek" key={slots.peek.id}>{slots.peek.icon && <Icon name={slots.peek.icon as IconName} />}<span>{slots.peek.title}</span></div>}
    </>
  );
}

/** Something urgent: a banner over everything until it expires. */
export function Takeover({ item }: { item: Slots["takeover"] }) {
  if (!item) return null;
  return (
    <div className="takeover" key={item.id}>
      <div className="takecard">{item.icon && <Icon name={item.icon as IconName} className="takeicon" />}<div style={{ minWidth: 0 }}><div className="take-title clamp">{item.title}</div>{item.detail && <div className="small">{item.detail}</div>}</div></div>
    </div>
  );
}
