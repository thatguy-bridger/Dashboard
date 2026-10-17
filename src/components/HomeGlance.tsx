"use client";

import { useEffect, useState } from "react";
import { pollEvery } from "@/lib/poll";
import { lightColor } from "@/lib/lightColor";

interface Glance {
  provider: string;
  lights: { id: string; name: string; room: string; on: boolean; hs?: [number, number]; colorTemp?: number; brightness?: number }[];
  plugs: { name: string; on: boolean }[];
  fans: { name: string; on: boolean; speed: number; steps: number }[];
  media: { name: string; playing: boolean; on: boolean; title: string | null; volume: number | null }[];
  timers: { name: string; endsAt: number; action: "on" | "off" }[];
  people: { name: string; home: boolean }[];
  away: boolean;
  guest: boolean;
}

// One shared poller for every widget on the screen (each widget used to make its own request).
let shared: Glance | null = null;
const listeners = new Set<(g: Glance | null) => void>();
let stopShared: (() => void) | null = null;

async function loadGlance() {
  try {
    const headers: Record<string, string> = {};
    const pin = localStorage.getItem("hb-control-pin");
    const dev = localStorage.getItem("home-base:device-id");
    if (pin) headers["x-control-pin"] = pin;
    if (dev) headers["x-device-id"] = dev;
    const res = await fetch("/api/home/glance", { cache: "no-store", headers });
    shared = res.ok ? ((await res.json()) as Glance) : null;
    listeners.forEach((fn) => fn(shared));
  } catch { /* keep last */ }
}

/** House state for the StandBy screens. Sent with the Control PIN if this screen has one, else its device id
 *  (approved screens only): the answer says who is home, so it isn't public. Refreshes once a minute. */
function useHomeGlance(): Glance | null {
  const [g, setG] = useState<Glance | null>(shared);
  useEffect(() => {
    listeners.add(setG);
    if (!stopShared) {
      loadGlance();
      stopShared = pollEvery(loadGlance, 60_000);
    }
    return () => {
      listeners.delete(setG);
      if (listeners.size === 0 && stopShared) { stopShared(); stopShared = null; }
    };
  }, []);
  return g;
}

function useNowMs(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

const card = "flex flex-col min-w-0 min-h-0 overflow-hidden";
const cardStyle = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))",
  border: "1px solid rgba(255,255,255,0.12)",
} as const;

const Dot = ({ color, glow }: { color: string; glow?: boolean }) => (
  <span className="rounded-full shrink-0" style={{ width: 14, height: 14, background: color, boxShadow: glow ? `0 0 10px ${color}` : undefined }} />
);

function Chip({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "good" | "warn" }) {
  const border = tone === "warn" ? "rgba(255,184,77,0.55)" : tone === "good" ? "rgba(120,220,150,0.45)" : "rgba(255,255,255,0.12)";
  return (
    <div className="flex items-center gap-2 px-4 rounded-full shrink-0 whitespace-nowrap" style={{ height: 46, background: "linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))", border: `1px solid ${border}` }}>
      {children}
    </div>
  );
}

/** The house pills for the top bar of every screen: who's home, guest/away mode, lights on, fan, speakers, next timer. */
export function HomeStatusPills() {
  const g = useHomeGlance();
  const now = useNowMs(15_000);
  if (!g) return null;
  const lightsOn = g.lights.filter((l) => l.on).length;
  const playing = g.media.filter((m) => m.playing).length;
  const fan = g.fans.find((f) => f.on);
  const nextTimer = [...g.timers].sort((a, b) => a.endsAt - b.endsAt)[0];
  const pill = (tone: "plain" | "good" | "warn", key: string, children: React.ReactNode) => {
    const border = tone === "warn" ? "rgba(255,184,77,0.55)" : tone === "good" ? "rgba(120,220,150,0.45)" : "rgba(255,255,255,0.12)";
    return (
      <div key={key} className="flex items-center gap-2 px-3.5 rounded-full shrink-0 whitespace-nowrap" style={{ height: 36, background: "linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))", border: `1px solid ${border}` }}>
        {children}
      </div>
    );
  };
  return (
    <>
      {g.people.map((p) => pill(p.home ? "good" : "plain", p.name, (
        <>
          <Dot color={p.home ? "#7be09a" : "#777"} glow={p.home} />
          <span className="text-white font-semibold" style={{ fontSize: 14 }}>{p.name.split(" ")[0]}</span>
          <span className="text-white/55 font-semibold" style={{ fontSize: 13 }}>{p.home ? "home" : "away"}</span>
        </>
      )))}
      {g.guest && pill("warn", "guest", <span className="font-bold" style={{ fontSize: 14, color: "#ffb84d" }}>Guest mode</span>)}
      {g.away && !g.guest && pill("warn", "away", <span className="font-bold" style={{ fontSize: 14, color: "#ffb84d" }}>Away mode</span>)}
      {pill("plain", "lights", (
        <>
          <Dot color={lightsOn ? "#ffd27a" : "#555"} glow={lightsOn > 0} />
          <span className="num-rounded font-bold text-white" style={{ fontSize: 15 }}>{lightsOn}</span>
          <span className="text-white/55 font-semibold" style={{ fontSize: 13 }}>of {g.lights.length} lights</span>
        </>
      ))}
      {fan && pill("plain", "fan", (
        <>
          <span className="text-white/55 font-semibold" style={{ fontSize: 13 }}>Fan</span>
          <span className="num-rounded font-bold text-white" style={{ fontSize: 15 }}>{Math.max(1, Math.round((fan.speed / 100) * (fan.steps > 8 ? 6 : fan.steps)))}</span>
        </>
      ))}
      {playing > 0 && pill("plain", "media", (
        <>
          <span className="num-rounded font-bold text-white" style={{ fontSize: 15 }}>{playing}</span>
          <span className="text-white/55 font-semibold" style={{ fontSize: 13 }}>playing</span>
        </>
      ))}
      {nextTimer && pill("warn", "timer", (
        <>
          <span className="text-white/80 font-semibold" style={{ fontSize: 13 }}>{nextTimer.name} {nextTimer.action} in</span>
          <span className="num-rounded font-bold" style={{ fontSize: 14, color: "#ffb84d" }}>{Math.max(1, Math.round((nextTimer.endsAt - now) / 60_000))}m</span>
        </>
      ))}
    </>
  );
}

/** Every light as a glowing dot in its real colour, grouped by room. */
export function HomeLights() {
  const g = useHomeGlance();
  if (!g) return null;
  const rooms = [...new Set(g.lights.map((l) => l.room))].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  const on = g.lights.filter((l) => l.on).length;
  return (
    <div className={card} style={{ ...cardStyle, borderRadius: 40, padding: "22px 28px", height: "100%", width: "100%" }}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="caps-label" style={{ fontSize: 13 }}>Lights</div>
        <div className="num-rounded font-bold text-white" style={{ fontSize: 22 }}>{on}<span className="text-white/45 font-semibold" style={{ fontSize: 15 }}> of {g.lights.length} on</span></div>
      </div>
      <div className="flex flex-col gap-3 overflow-hidden">
        {rooms.map((r) => (
          <div key={r}>
            <div className="text-white/55 font-semibold mb-1.5" style={{ fontSize: 14 }}>{r}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {g.lights.filter((l) => l.room === r).map((l) => (
                <div key={l.id} className="flex items-center gap-2 min-w-0">
                  <Dot color={lightColor(l)} glow={l.on} />
                  <span className="font-semibold truncate" style={{ fontSize: 15, color: l.on ? "#fff" : "rgba(255,255,255,0.4)", maxWidth: 150 }}>{l.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Speakers and TVs: what's playing and how loud. */
export function HomeSpeakers() {
  const g = useHomeGlance();
  if (!g) return null;
  const active = g.media.filter((m) => m.playing || (m.on && m.title));
  return (
    <div className={card} style={{ ...cardStyle, borderRadius: 40, padding: "22px 28px", height: "100%", width: "100%" }}>
      <div className="caps-label mb-3" style={{ fontSize: 13 }}>Speakers &amp; TVs</div>
      {active.length === 0 ? (
        <div className="text-white/45 font-semibold" style={{ fontSize: 18 }}>Everything is quiet</div>
      ) : (
        <div className="flex flex-col gap-3 overflow-hidden">
          {active.map((m) => (
            <div key={m.name} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-white font-bold truncate" style={{ fontSize: 19 }}>{m.name}</span>
                {m.volume != null && <span className="num-rounded font-semibold text-white/55 shrink-0" style={{ fontSize: 15 }}>{m.volume}%</span>}
              </div>
              <div className="text-white/55 font-semibold truncate" style={{ fontSize: 15 }}>{m.title ?? (m.playing ? "Playing" : "On")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Plugs and switches as on/off pills. */
export function HomePlugs() {
  const g = useHomeGlance();
  if (!g) return null;
  return (
    <div className={card} style={{ ...cardStyle, borderRadius: 40, padding: "22px 28px", height: "100%", width: "100%" }}>
      <div className="caps-label mb-3" style={{ fontSize: 13 }}>Plugs</div>
      <div className="flex flex-wrap gap-2 overflow-hidden">
        {g.plugs.map((p) => (
          <div key={p.name} className="flex items-center gap-2 px-3 rounded-full" style={{ height: 38, background: p.on ? "rgba(255,210,122,0.18)" : "rgba(255,255,255,0.07)", border: `1px solid ${p.on ? "rgba(255,210,122,0.5)" : "rgba(255,255,255,0.1)"}` }}>
            <Dot color={p.on ? "#ffd27a" : "#555"} glow={p.on} />
            <span className="font-semibold" style={{ fontSize: 14, color: p.on ? "#fff" : "rgba(255,255,255,0.45)" }}>{p.name}</span>
          </div>
        ))}
        {g.plugs.length === 0 && <span className="text-white/45 font-semibold" style={{ fontSize: 16 }}>No plugs found</span>}
      </div>
    </div>
  );
}
