"use client";
import { useMemo } from "react";
import type { Home } from "@/lib/ha";
import { fanRequest, guestPlan, lightsRequest } from "@/lib/guest";
import { Clock } from "./widgets";
import { Icon } from "./Icon";
import { GlassGroup } from "./glass";

const NAMES = (n: number) => ["Off", ...(n === 3 ? ["Low", "Medium", "High"] : n === 2 ? ["Low", "High"] : n === 1 ? ["On"] : Array.from({ length: n }, (_, i) => `${i + 1}`))];

/** The whole screen in guest mode: one big Lights switch and the fan. Nothing else is rendered, so there is nothing else to reach. */
export function GuestScreen({ home, now, act }: { home: Home | null; now: number; act: (body: Record<string, unknown>) => void }) {
  const plan = useMemo(() => guestPlan(home?.devices ?? []), [home]);
  return (
    <div className="guest">
      <Clock now={now} className="mini guest-clock" />
      <button className={`guest-lights ${plan.lightsOn ? "on" : ""}`} role="switch" aria-checked={plan.lightsOn} disabled={!plan.lightIds.length} onClick={() => act(lightsRequest(plan))}>
        <Icon name="bulb" className="guest-bulb" />
        <span className="guest-label">Lights</span>
        <span className="guest-state">{!plan.lightIds.length ? "Not available" : plan.lightsOn ? "On" : "Off"}</span>
      </button>
      {plan.fans.map((f) => (
        <div key={f.id} className="guest-fan">
          <div className="guest-fanhead"><Icon name="fan" /><span>{plan.fans.length > 1 ? f.name : "Fan"}</span></div>
          <GlassGroup className="steps glass guest-steps" active={Math.min(f.step, f.steps)}>{NAMES(f.steps).map((nm, i) => <button key={i} data-gi-item className={i === f.step ? "on" : ""} onClick={() => act(fanRequest(f, i))}>{nm}</button>)}</GlassGroup>
        </div>
      ))}
    </div>
  );
}
