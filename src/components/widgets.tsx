"use client";
import { useRef } from "react";
import { fmtClock, fmtTime, mmss, when } from "@/lib/format";
import { conditionText } from "@/lib/sources/weather";
import type { SlotItem } from "@/lib/slots";
import type { Ev, Music, Weather } from "@/lib/types";
import { Icon, weatherIconName, type IconName } from "./Icon";

export const Dot = ({ color }: { color?: string }) => <span className="dot" style={{ color: color ?? "var(--accent)", background: color ?? "var(--accent)" }} />;
const iconOf = (s?: string) => (s as IconName | undefined);

export function Clock({ now, className = "" }: { now: number; className?: string }) {
  const c = fmtClock(now);
  return <div className={`clock ${className}`}>{c.time}{c.ampm && <small>{c.ampm}</small>}</div>;
}
export const DateLine = ({ now, away }: { now: number; away?: boolean }) => {
  const d = new Date(now);
  return <div className="date fit">{d.toLocaleDateString([], { weekday: "long" })} · {d.toLocaleDateString([], { month: "long", day: "numeric" })}{away ? " · away" : ""}</div>;
};

export function WeatherCard({ w, big }: { w: Weather | null; big?: boolean }) {
  if (!w?.current) return null;
  const code = w.current.weather_code, night = w.current.is_day === 0;
  const hi = w.daily?.temperature_2m_max[0], lo = w.daily?.temperature_2m_min[0];
  return (
    <div className={`wx ${big ? "big" : ""}`}>
      <Icon name={weatherIconName(code, night)} className="wxicon" /><span className="temp">{Math.round(w.current.temperature_2m)}°</span>
      <div><div className="mid" style={{ fontWeight: 600 }}>{conditionText(code)}</div>{hi != null && lo != null && <div className="small">H {Math.round(hi)}° · L {Math.round(lo)}°</div>}</div>
    </div>
  );
}

/** One pill (zone: pill). Same component for every kind of information. */
export function SlotPill({ item }: { item: SlotItem }) {
  return <div className="pill">{item.icon ? <Icon name={iconOf(item.icon)!} className="pillicon" /> : <Dot color={item.color} />}<span className="fit">{item.title}</span>{item.detail && <b>{item.detail}</b>}</div>;
}
/** One card of the strip (zone: strip). */
export function StripCard({ item }: { item: SlotItem }) {
  return <div className="chipcard">{item.icon ? <Icon name={iconOf(item.icon)!} className="pillicon" /> : <Dot color={item.color} />}<div style={{ minWidth: 0 }}><div className="clamp1 midsm">{item.title}</div>{item.detail && <div className="small clamp1">{item.detail}</div>}</div></div>;
}

export function EventList({ events, now, max = 5, title = "Up next" }: { events: Ev[]; now: number; max?: number; title?: string }) {
  return (
    <div className="card agenda">
      <div className="cap" style={{ marginBottom: "calc(1.6 * var(--u))" }}>{title}</div>
      {events.length === 0 && <div className="small">Nothing coming up</div>}
      {events.slice(0, max).map((e, i) => (
        <div key={i} className="row evrow"><Dot color={e.color} /><div style={{ minWidth: 0, flex: 1 }}><div className="mid clamp">{e.title}</div><div className="small">{when(e, now)}</div></div></div>))}
    </div>
  );
}

export function ArtTile({ src, className = "art" }: { src: string | null; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className={className} src={src} alt="" decoding="async" draggable={false} /> : <div className={className} />;
}

export function Transport({ m, control }: { m: Music; control: (c: Record<string, unknown>) => void }) {
  const stop = (f: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); f(); };
  return (
    <div className="row transport">
      <button className="ctl" onClick={stop(() => control({ action: "previous" }))} aria-label="Previous"><Icon name="skip-back" /></button>
      <button className="ctl main" onClick={stop(() => control({ action: m.playing ? "pause" : "play" }))} aria-label="Play or pause"><Icon name={m.playing ? "pause" : "play"} /></button>
      <button className="ctl" onClick={stop(() => control({ action: "next" }))} aria-label="Next"><Icon name="skip-forward" /></button>
    </div>
  );
}

export function Progress({ m, now }: { m: Music; now: number }) {
  const pos = Math.min(m.duration, m.progress + (m.playing ? (now - m.at) / 1000 : 0));
  return (
    <div>
      <div className="bar"><i style={{ width: `${m.duration ? (pos / m.duration) * 100 : 0}%` }} /></div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: "calc(.6 * var(--u))" }}><span className="small">{mmss(pos)}</span><span className="small">{mmss(m.duration)}</span></div>
    </div>
  );
}

export function VolumePill({ m, control }: { m: Music; control: (c: Record<string, unknown>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  if (m.volume == null) return null;
  const set = (e: React.PointerEvent, final: boolean) => { const r = ref.current!.getBoundingClientRect(); const v = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)); if (final) control({ action: "volume", level: v }); };
  return <div ref={ref} className="vol" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e, false); }} onPointerUp={(e) => set(e, true)}><i style={{ height: `${m.volume * 100}%` }} /></div>;
}
export { fmtTime };


/** Every artist on the song (medium weight, a touch of the accent), then the album a little dimmer and smaller. */
export function ArtistsLine({ m, className = "" }: { m: { artist?: string; artists?: string[] }; className?: string }) {
  const names = m.artists && m.artists.length ? m.artists : (m.artist ?? "").split(", ").filter(Boolean);
  if (!names.length) return null;
  return <div className={`artists clamp2 ${className}`}>{names.join(", ")}</div>;
}
export function AlbumLine({ album, className = "" }: { album?: string; className?: string }) {
  if (!album) return null;
  return <div className={`album fit ${className}`}><Icon name="disc" /><span className="fit">{album}</span></div>;
}
