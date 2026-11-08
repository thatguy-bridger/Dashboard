"use client";
import { fmtTime, hourLabel } from "@/lib/format";
import type { Ev } from "@/lib/types";

/** The day as a line with a "now" marker. Events sit on the line in lanes; the next one is highlighted. */
export function Timeline({ events, now, compact }: { events: Ev[]; now: number; compact?: boolean }) {
  const timed = events.filter((e) => !e.allDay && e.end * 1000 > now);
  const HOUR = 3600000;
  const from = Math.floor((now - HOUR) / HOUR) * HOUR;
  const lastEnd = timed.reduce((m, e) => Math.max(m, e.end * 1000), 0);
  const to = Math.min(from + 14 * HOUR, Math.max(from + 6 * HOUR, Math.ceil((lastEnd + 30 * 60000) / HOUR) * HOUR));
  const span = to - from;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - from) / span) * 100));
  const shown = timed.filter((e) => e.start * 1000 < to);
  const laneEnd: number[] = [];                                                           // greedy lanes so overlapping events never sit on top of each other
  const placed = shown.map((e) => { let lane = laneEnd.findIndex((x) => x <= e.start * 1000); if (lane < 0) { lane = laneEnd.length; laneEnd.push(0); } laneEnd[lane] = e.end * 1000; return { e, lane }; });
  const lanes = Math.max(1, Math.min(3, laneEnd.length));
  const ticks: number[] = []; for (let t = from; t <= to; t += HOUR) ticks.push(t);
  const next = shown.find((e) => e.end * 1000 > now);
  return (
    <div className={`timeline ${compact ? "compact" : ""}`} style={{ ["--lanes" as string]: lanes }}>
      <div className="tl-track">
        {ticks.map((t) => <div key={t} className="tl-tick" style={{ left: `${pct(t)}%` }}><span>{hourLabel(new Date(t).getHours())}</span></div>)}
        {placed.filter((p) => p.lane < 3).map(({ e, lane }, i) => {
          const left = pct(e.start * 1000), width = Math.max(5, pct(e.end * 1000) - left);
          const on = e === next, running = e.start * 1000 <= now;
          return (
            <div key={i} className={`tl-event ${on ? "next" : ""} ${running ? "running" : ""}`} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, top: `calc(${lane} * var(--lane-h))`, ["--c" as string]: e.color ?? "var(--accent)" }}>
              <div className="clamp1 tl-title">{e.title}</div>{!compact && <div className="tl-time">{fmtTime(e.start * 1000)}</div>}
            </div>
          );
        })}
        <div className="tl-now" style={{ left: `${pct(now)}%` }}><span>Now</span></div>
      </div>
    </div>
  );
}
