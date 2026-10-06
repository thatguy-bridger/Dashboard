"use client";

import { useEffect, useRef, useState } from "react";
import { FitText } from "@/components/FitText";

export interface TickerItem {
  id: string;
  message: string;
  color: string;
}

/** Longer messages stay longer: ~60ms per character on top of a 3.5s base, within 4-14s. */
const dwell = (msg: string) => Math.min(14_000, Math.max(4_000, 3_500 + msg.length * 60));

/** One pill for every notification: it scrolls vertically through them, giving each as long
 *  as it needs to be read. A single notification just sits there. */
export function NotificationTicker({
  items,
  onDismiss,
  maxWidth = 420,
}: {
  items: TickerItem[];
  onDismiss?: (id: string) => void;
  maxWidth?: number;
}) {
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState<TickerItem | null>(null);
  const shown = useRef<TickerItem | null>(null);

  const cur = items.length ? items[index % items.length] : null;

  // Keep the outgoing item around for the slide-out.
  useEffect(() => {
    if (shown.current && cur && shown.current.id !== cur.id) {
      setPrev(shown.current);
      const t = setTimeout(() => setPrev(null), 550);
      shown.current = cur;
      return () => clearTimeout(t);
    }
    shown.current = cur;
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the item id

  // Advance after the current message has had time to be read.
  useEffect(() => {
    if (!cur || items.length < 2) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % items.length), dwell(cur.message));
    return () => clearTimeout(t);
  }, [cur?.id, items.length]); // eslint-disable-line react-hooks/exhaustive-deps -- restart the timer per item

  if (!cur) return null;

  const row = (it: TickerItem, anim: string) => (
    <div
      key={`${it.id}-${anim}`}
      className="absolute inset-0 flex items-center gap-3 px-5"
      style={{ animation: `${anim} 0.5s cubic-bezier(0.32,0.72,0,1) both`, paddingRight: items.length > 1 ? 44 : 20 }}
    >
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: it.color, boxShadow: `0 0 10px ${it.color}` }} />
      <FitText lines={2} min={0.72} className="text-white font-semibold leading-tight flex-1 min-w-0" style={{ fontSize: 14 }}>
        {it.message}
      </FitText>
    </div>
  );

  return (
    <div
      onClick={() => onDismiss?.(cur.id)}
      className="relative overflow-hidden shrink-0"
      style={{
        height: 46,
        // Takes whatever room is left in its row (shrinking next to other pills), never more than maxWidth.
        flex: "1 1 0",
        minWidth: 180,
        maxWidth,
        borderRadius: 23,
        background: "linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))",
        border: "1px solid rgba(255,255,255,0.12)",
        pointerEvents: onDismiss ? "auto" : "none",
        cursor: onDismiss ? "pointer" : undefined,
      }}
    >
      {prev && row(prev, "ticker-out")}
      {row(cur, prev ? "ticker-in" : "fade-in")}
      {items.length > 1 && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/40 num-rounded">
          {(index % items.length) + 1}/{items.length}
        </span>
      )}
    </div>
  );
}
