"use client";
import { rgbVar } from "@/lib/color";
import { useEffect, useRef, useState } from "react";
import { fmtTime, hourLabel } from "@/lib/format";
import type { Ev } from "@/lib/types";

const HOUR = 3600000;
const MIN_BLOCK_PX = 128;      // an event block is never narrower than this, so its title stays readable

/** The day as a line with a "now" marker. The window is about 8 hours so events have room; blocks have a minimum width and are placed in lanes by their *drawn* width, so two never overlap. */
export function Timeline({ events, now, compact }: { events: Ev[]; now: number; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(1100);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setPx(Math.max(300, el.clientWidth)));
    ro.observe(el); setPx(Math.max(300, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const timed = events.filter((e) => !e.allDay && e.end * 1000 > now);
  const from = Math.floor((now - 40 * 60000) / (HOUR / 2)) * (HOUR / 2);
  const lastEnd = timed.slice(0, 6).reduce((m, e) => Math.max(m, e.end * 1000), 0);
  const to = from + Math.min(10, Math.max(6, Math.ceil((lastEnd + 30 * 60000 - from) / HOUR))) * HOUR;
  const span = to - from;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - from) / span) * 100));
  const minPct = Math.min(40, (MIN_BLOCK_PX / px) * 100);
  const shown = timed.filter((e) => e.start * 1000 < to);
  const laneEnd: number[] = [];                                                       // greedy lanes on the drawn extent (at least the minimum width)
  const placed = shown.map((e) => {
    const left = pct(e.start * 1000), right = Math.max(pct(e.end * 1000), left + minPct);
    let lane = laneEnd.findIndex((x) => x <= left + 0.2);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(0); }
    laneEnd[lane] = right;
    return { e, lane, left, width: Math.min(right - left, 100 - left) };
  }).filter((p) => p.lane < 3);
  const lanes = Math.max(1, Math.min(3, laneEnd.length));
  const ticks: number[] = []; for (let t = Math.ceil(from / HOUR) * HOUR; t <= to; t += HOUR) ticks.push(t);
  const next = shown.find((e) => e.end * 1000 > now);
  return (
    <div ref={ref} className={`timeline ${compact ? "compact" : ""}`} style={{ ["--lanes" as string]: lanes }} data-area="timeline">
      <div className="tl-track">
        {ticks.map((t) => <div key={t} className="tl-tick" style={{ left: `${pct(t)}%` }}><span>{hourLabel(new Date(t).getHours())}</span></div>)}
        {placed.map(({ e, lane, left, width }, i) => {
          const on = e === next, running = e.start * 1000 <= now;
          return (
            <div key={i} className={`tl-event ${on ? "next" : ""} ${running ? "running" : ""}`} data-area="tlevent" style={{ left: `${left}%`, width: `${width}%`, top: `calc(${lane} * var(--lane-h))`, ["--c" as string]: e.color ?? "var(--accent)", ["--c-rgb" as string]: rgbVar(e.color) }}>
              <div className="tl-title">{e.title}</div>{!compact && <div className="tl-time">{fmtTime(e.start * 1000)}</div>}
            </div>
          );
        })}
        <div className="tl-now" style={{ left: `${pct(now)}%` }}><span>Now</span></div>
      </div>
    </div>
  );
}
