"use client";

import { useEffect, useState } from "react";
import { WeatherIcon } from "@/lib/weatherVisuals";
import { weatherLabel } from "@/lib/weatherCodes";
import { eventColor } from "@/lib/eventColors";
import { useFeeds } from "@/lib/liveActivities";
import { useSettings } from "@/lib/useSettings";
import { pollEvery } from "@/lib/poll";
import { Marquee } from "@/components/Marquee";
import { DeviceGlyph } from "@/components/DeviceGlyph";

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
 *  what's next + batteries + unread count on the right. The island owns the middle. */
export type TopBarHide = "weather" | "countdown" | "batteries" | "unread";

export function TopBar({ hide = [] }: { hide?: TopBarHide[] }) {
  const { weather, events, devices, notes } = useFeeds();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const commute = useCommute(now);

  const next = (events ?? []).find((e) => {
    if (e.allDay) return false;
    const st = parseWhen(e.start).getTime();
    const en = parseWhen(e.end ?? e.start).getTime();
    return en > now.getTime() && st - now.getTime() < 6 * 3600_000;
  });
  const mins = next ? Math.round((parseWhen(next.start).getTime() - now.getTime()) / 60_000) : 0;
  const soon = Boolean(next) && mins <= 10;

  const batteries = (devices ?? [])
    .filter((d) => !d.isPerson && typeof d.batteryLevel === "number" && (d.batteryLevel as number) >= 0)
    .sort((a, b) => ["iphone", "watch", "ipad", "mac", "pod"].findIndex((k) => a.deviceClass.toLowerCase().includes(k)) - ["iphone", "watch", "ipad", "mac", "pod"].findIndex((k) => b.deviceClass.toLowerCase().includes(k)))
    .slice(0, 3);
  const unread = (notes ?? []).filter((n) => !n.read).length;

  return (
    <div className="fixed top-3 left-0 right-0 z-10 pointer-events-none flex items-start justify-between" style={{ padding: "0 20px" }}>
      <div className="flex items-center gap-3 min-w-0 overflow-hidden" style={{ maxWidth: "calc(50% - 290px)" }}>
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
      </div>

      <div className="flex items-center gap-3 min-w-0 overflow-hidden justify-end" style={{ maxWidth: "calc(50% - 290px)" }}>
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
        {(hide.includes("batteries") ? [] : batteries).map((d) => {
          const pct = Math.round((d.batteryLevel as number) * 100);
          const low = pct <= 20;
          return (
            <div key={d.id} className={chip} style={chipStyle} title={d.name}>
              <DeviceGlyph cls={d.deviceClass} color="rgba(255,255,255,0.75)" />
              <div className="leading-none">
                <div className="num-rounded font-bold" style={{ fontSize: 16, color: low ? "#ff6b6b" : "#fff" }}>{pct}%</div>
                <div className="text-white/45 font-semibold truncate" style={{ fontSize: 9, maxWidth: 54, marginTop: 2 }}>
                  {d.name.replace(/^.{1,24}?[’']s\s+/, "")}
                </div>
              </div>
            </div>
          );
        })}
        {unread > 0 && !hide.includes("unread") && (
          <div className={chip} style={chipStyle} title={`${unread} unread`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9zM10 19a2 2 0 0 0 4 0" />
            </svg>
            <span className="num-rounded font-bold text-white" style={{ fontSize: 16 }}>{unread}</span>
          </div>
        )}
      </div>
    </div>
  );
}
