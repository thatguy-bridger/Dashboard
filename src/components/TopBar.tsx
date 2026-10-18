"use client";

import { useEffect, useRef, useState } from "react";
import { WeatherIcon } from "@/lib/weatherVisuals";
import { weatherLabel } from "@/lib/weatherCodes";
import { eventColor } from "@/lib/eventColors";
import { useFeeds } from "@/lib/liveActivities";
import { useSettings } from "@/lib/useSettings";
import { pollEvery } from "@/lib/poll";
import { Marquee } from "@/components/Marquee";
import { HomePeoplePills, HomeStatePills } from "@/components/HomeGlance";

const chip = "flex items-center gap-2.5 px-4 rounded-full shrink-0 min-w-0";
const chipStyle = {
  height: 46,
  background: "linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))",
  border: "1px solid rgba(255,255,255,0.12)",
} as const;

const parseWhen = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : new Date(s);

/** Commute only matters when you're about to make it: weekday mornings out, afternoons back. */
function commuteLeg(now: Date): "out" | "back" | null {
  const day = now.getDay();
  if (day === 0 || day === 6) return null;
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 5 && h < 10) return "out";
  if (h >= 15 && h < 19) return "back";
  return null;
}

function useCommute(now: Date) {
  const settings = useSettings();
  const leg = commuteLeg(now);
  const home = settings?.mapHome ?? null;
  const dest = settings?.commute ?? null;
  const [eta, setEta] = useState<{ min: number; delay: number } | null>(null);
  const active = Boolean(leg && home && dest);
  const key = active ? `${leg}|${home!.lat},${home!.lon}|${dest!.lat},${dest!.lon}` : "";

  useEffect(() => {
    if (!active || !home || !dest) {
      setEta(null);
      return;
    }
    const [from, to] = leg === "out" ? [home, dest] : [dest, home];
    let off = false;
    async function load() {
      try {
        const q = new URLSearchParams({ originLat: String(from.lat), originLon: String(from.lon), destLat: String(to.lat), destLon: String(to.lon) });
        const res = await fetch(`/api/traffic/eta?${q}`);
        if (!res.ok) return;
        const j = await res.json();
        if (!off) setEta({ min: j.travelTimeMin, delay: j.delayMin });
      } catch {
        // keep last
      }
    }
    load();
    const stop = pollEvery(load, 5 * 60_000);
    return () => {
      off = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures leg + coordinates
  }, [key]);

  if (!active || !eta || !dest || !home) return null;
  const place = leg === "out" ? dest : home;
  return { label: leg === "out" ? dest.label.split(/ — |,/)[0] : "Home", min: eta.min, delay: eta.delay, placeLabel: place.label };
}

function Car() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 16V11l1.7-4.2A2 2 0 0 1 8.6 5.5h6.8a2 2 0 0 1 1.9 1.3L19 11v5M3.5 16h17v2.5H3.5zM7.5 13.5h.01M16.5 13.5h.01" />
    </svg>
  );
}

/** Fixed bar across the top of every screen and mode: weather + commute on the left,
 *  what's next + this tablet's battery on the right. The island owns the middle. */
export type TopBarHide = "weather" | "countdown";

/** This tablet's own battery: the browser's Battery API when it has one, otherwise what the Home Assistant app reports. */
function useSelfBattery(enabled: boolean, pin: string | null) {
  const [b, setB] = useState<{ pct: number; charging: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    let cleanup = () => {};
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (e: string, f: () => void) => void; removeEventListener: (e: string, f: () => void) => void }> };
    const fromHa = async () => {
      if (!pin) return;
      try {
        const res = await fetch("/api/home/screen?battery=1", { cache: "no-store", headers: { "x-control-pin": pin } });
        const j = await res.json();
        if (!off && typeof j.level === "number") setB({ pct: Math.round(j.level), charging: Boolean(j.charging) });
      } catch { /* keep last */ }
    };
    if (nav.getBattery) {
      nav.getBattery().then((bat) => {
        if (off) return;
        const upd = () => setB({ pct: Math.round(bat.level * 100), charging: bat.charging });
        upd();
        bat.addEventListener("levelchange", upd);
        bat.addEventListener("chargingchange", upd);
        cleanup = () => { bat.removeEventListener("levelchange", upd); bat.removeEventListener("chargingchange", upd); };
      }).catch(fromHa);
    } else {
      fromHa();
      cleanup = pollEvery(fromHa, 2 * 60_000);
    }
    return () => { off = true; cleanup(); };
  }, [enabled, pin]);
  return b;
}

/** Keeps the whole top row visible: if the pills on both sides are wider than the space between the screen edges (leaving the
 *  middle free for the music pill), both sides shrink together instead of being cropped. */
function useFitScale(deps: unknown[]) {
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const measure = () => {
      const l = left.current, r = right.current;
      if (!l || !r) return;
      const natural = l.offsetWidth + r.offsetWidth + 24;
      const room = window.innerWidth - 40 - 300; // 20px margins, and 300px kept free in the middle for the island
      setScale(natural > room ? Math.max(0.5, room / natural) : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (left.current) ro.observe(left.current);
    if (right.current) ro.observe(right.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measures when the pills change
  }, deps);
  return { left, right, scale };
}

export function TopBar({ hide = [], showTime = false, selfBattery = false, pin = null }: { hide?: TopBarHide[]; showTime?: boolean; selfBattery?: boolean; pin?: string | null }) {
  const self = useSelfBattery(selfBattery, pin);
  const { weather, events } = useFeeds();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const commute = useCommute(now);
  const fit = useFitScale([showTime, selfBattery]);

  const next = (events ?? []).find((e) => {
    if (e.allDay) return false;
    const st = parseWhen(e.start).getTime();
    const en = parseWhen(e.end ?? e.start).getTime();
    return en > now.getTime() && st - now.getTime() < 6 * 3600_000;
  });
  const mins = next ? Math.round((parseWhen(next.start).getTime() - now.getTime()) / 60_000) : 0;
  const soon = Boolean(next) && mins <= 10;


  return (
    <div className="fixed top-3 left-0 right-0 z-10 pointer-events-none flex items-start justify-between" style={{ padding: "0 20px" }}>
      <div ref={fit.left} className="flex items-center gap-3 shrink-0" style={{ transform: `scale(${fit.scale})`, transformOrigin: "left top" }}>
        {showTime && (
          <div className={chip} style={chipStyle}>
            <span className="num-rounded font-bold text-white whitespace-nowrap" style={{ fontSize: 22 }}>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          </div>
        )}
        {weather && !hide.includes("weather") && (
          <div className={chip} style={chipStyle}>
            <WeatherIcon code={weather.weatherCode} isDay={weather.isDay} className="w-6 h-6 shrink-0" />
            <span className="num-rounded font-bold text-white" style={{ fontSize: 20 }}>{Math.round(weather.tempF)}°</span>
            <span className="text-white/60 font-semibold truncate" style={{ fontSize: 14 }}>{weatherLabel(weather.weatherCode)}</span>
          </div>
        )}
        {commute && (
          <div className={chip} style={chipStyle} title={commute.placeLabel}>
            <Car />
            <span className="text-white/60 font-semibold truncate" style={{ fontSize: 14, maxWidth: 110 }}>{commute.label}</span>
            <span className="num-rounded font-bold text-white whitespace-nowrap" style={{ fontSize: 18 }}>{commute.min} min</span>
            {commute.delay >= 5 && <span className="num-rounded font-bold whitespace-nowrap" style={{ fontSize: 13, color: "#ffb84d" }}>+{commute.delay}</span>}
          </div>
        )}
        <HomePeoplePills />
      </div>

      <div ref={fit.right} className="flex items-center gap-3 shrink-0 justify-end" style={{ transform: `scale(${fit.scale})`, transformOrigin: "right top" }}>
        {next && !hide.includes("countdown") && (
          <div className={chip} style={{ ...chipStyle, borderColor: soon ? "rgba(255,184,77,0.55)" : "rgba(255,255,255,0.12)" }}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: soon ? "#ffb84d" : (next.color ?? eventColor(next.colorId, next.source)), boxShadow: `0 0 8px ${soon ? "#ffb84d" : (next.color ?? "#fff")}` }} />
            <div style={{ width: Math.min(210, Math.round(next.summary.length * 8.4)) }}>
              <Marquee className="text-white font-semibold text-[15px]" minScale={0.85}>{next.summary}</Marquee>
            </div>
            <span className="num-rounded font-bold whitespace-nowrap" style={{ fontSize: 15, color: soon ? "#ffb84d" : "rgba(255,255,255,0.7)" }}>
              {mins <= 0 ? "now" : mins >= 60 ? `in ${Math.floor(mins / 60)}h ${mins % 60}m` : `in ${mins} min`}
            </span>
          </div>
        )}
        <HomeStatePills />
        {self && (
          <div className={chip} style={chipStyle} title="This tablet">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={self.pct <= 20 && !self.charging ? "#ff6b6b" : "rgba(255,255,255,0.8)"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2.5" y="7" width="17" height="10" rx="2.5" />
              <path d="M22 10.5v3" />
              <rect x="4.5" y="9" width={Math.max(1, (self.pct / 100) * 13)} height="6" rx="1" fill={self.pct <= 20 && !self.charging ? "#ff6b6b" : "rgba(255,255,255,0.8)"} stroke="none" />
            </svg>
            <span className="num-rounded font-bold" style={{ fontSize: 18, color: self.pct <= 20 && !self.charging ? "#ff6b6b" : "#fff" }}>{self.pct}%{self.charging ? " ⚡" : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}
