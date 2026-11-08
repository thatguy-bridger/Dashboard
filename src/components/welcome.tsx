"use client";
import { useEffect, useState } from "react";
import { fmtTime } from "@/lib/format";
import { WELCOME_MS, GOODBYE_MS, type WelcomeInfo } from "@/lib/welcome";
import { Icon, type IconName } from "./Icon";

/** Coming home: a calm full-screen welcome for about eight seconds, then it fades away on its own. `hold` (test harness) keeps it up. */
export function Welcome({ info, onDone, hold }: { info: WelcomeInfo; onDone: () => void; hold?: boolean }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (hold) return;
    const a = setTimeout(() => setLeaving(true), WELCOME_MS), b = setTimeout(onDone, WELCOME_MS + 900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [hold, onDone]);
  const next = info.next;
  return (
    <div className={`welcome ${leaving ? "out" : ""}`} onPointerDown={() => { if (!hold) { setLeaving(true); setTimeout(onDone, 700); } }} role="status">
      <div className="welcome-in">
        <div className="welcome-title">{info.greeting}</div>
        <div className="welcome-rows">
          {info.weather && <div className="welcome-row"><Icon name={info.weather.icon as IconName} /><span>{info.weather.temp}° outside</span></div>}
          {next && <div className="welcome-row"><Icon name="calendar" /><span>{next.startsIn <= 0 ? "Now" : next.startsIn < 60 ? `In ${next.startsIn} min` : fmtTime(next.at)} · {next.title}</span></div>}
          {info.unread > 0 && <div className="welcome-row"><Icon name="mail" /><span>{info.unread} unread</span></div>}
        </div>
      </div>
    </div>
  );
}

/** Leaving: one quiet word that fades by itself. */
export function Goodbye({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, GOODBYE_MS); return () => clearTimeout(t); }, [onDone]);
  return <div className="goodbye" role="status"><Icon name="walk" />Goodbye</div>;
}
