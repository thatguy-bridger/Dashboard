"use client";
import type { Slots } from "@/lib/slots";
import { Icon, type IconName } from "./Icon";

/** Something urgent: a banner over everything until it expires (the one deliberate overlay; the rest of the page is a strict grid). */
export function Takeover({ item }: { item: Slots["takeover"] }) {
  if (!item) return null;
  return (
    <div className="takeover" key={item.id}>
      <div className="takecard">{item.icon && <Icon name={item.icon as IconName} className="takeicon" />}<div style={{ minWidth: 0 }}><div className="take-title clamp">{item.title}</div>{item.detail && <div className="small">{item.detail}</div>}</div></div>
    </div>
  );
}
