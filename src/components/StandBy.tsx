"use client";

import { useEffect, useRef, useState } from "react";
import { WeatherIcon, weatherGradient } from "@/lib/weatherVisuals";
import { weatherLabel } from "@/lib/weatherCodes";
import { eventColor } from "@/lib/eventColors";
import { useDrift } from "@/lib/useDrift";
import { useArtTheme, NEUTRAL_ACCENT } from "@/lib/useArtTheme";
import { LANDSCAPE_URLS } from "@/lib/landscapes";
import { controlSpotify, useEstimatedProgress, useLyrics, useNowPlaying } from "@/lib/spotifyClient";
import { Marquee } from "@/components/Marquee";
import { FitText } from "@/components/FitText";
import { useSettings } from "@/lib/useSettings";
import { pollEvery } from "@/lib/poll";
import { RippleReveal } from "@/components/RippleReveal";
import { WidgetRenderer } from "@/components/WidgetRenderer";
import { sizeForFootprint } from "@/lib/grid";
import { SpotifyIsland } from "@/components/SpotifyIsland";
import { useFeeds, useRoutine } from "@/lib/liveActivities";
import { defaultScenes, mergeScenes, mergeStandByLayout, pickScene, ROW_ITEMS, STANDBY_DEFAULT_SIZE, type StandByItem, type StandByScene } from "@/lib/standby";
import { isWidgetVisible, type VisibilityContext } from "@/lib/visibility";
import type { WidgetType } from "@/lib/presets";

const W = 1440;
const H = 900;

/** Staggered block reveal: opacity only, easeOut 0.9s (Islet DESIGN.md §8). */
const reveal = (delay: number): React.CSSProperties => ({
  animation: `fade-in 0.9s ease-out ${delay}s both`,
});

// ---------- data ----------

interface Hour { time: string; tempF: number; weatherCode: number; precipProbability?: number }
interface Day { date: string; highF: number; lowF: number; weatherCode: number }
interface Weather {
  tempF: number; feelsLikeF?: number; isDay: boolean; weatherCode: number; highF: number; lowF: number; hourly: Hour[];
  forecast?: Day[]; humidity?: number; windMph?: number; uvIndex?: number; sunrise?: string; sunset?: string;
}
interface CalEvent { summary: string; start: string; end?: string; allDay: boolean; source: string; colorId: string | null }
interface Note { id: string; message: string; level: string; source: string | null; read: boolean }

function usePolled<T>(url: string, everyMs: number, pick: (j: never) => T): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    let off = false;
    async function load() {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (!off) setV(pick(j as never));
      } catch {
        // keep last
      }
    }
    load();
    const stopPolling = pollEvery(load, everyMs);
    return () => {
      off = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- url/interval are constants per call site
  }, [url, everyMs]);
  return v;
}

/** Fit the 1440x900 design canvas to any screen: scale so the whole design fits, then hand the
 *  leftover width (ultrawide) or height (portrait) back to the layout instead of letterboxing. */
function useViewport() {
  const [v, setV] = useState({ s: 1, extraW: 0, extraH: 0 });
  useEffect(() => {
    const f = () => {
      const s = Math.min(window.innerWidth / W, window.innerHeight / H);
      setV({ s, extraW: Math.max(0, window.innerWidth / s - W), extraH: Math.max(0, window.innerHeight / s - H) });
    };
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return v;
}

/** Left/top items stay anchored, right/bottom items move with the far edge, centred items shift
 *  half, and anything spanning most of an axis stretches across the extra space. */
function adapt(it: StandByItem, extraW: number, extraH: number): StandByItem {
  let { x, y, w, h } = it;
  const cx = x + w / 2, cy = y + h / 2;
  if (extraW > 0) {
    if (w >= W * 0.85) w += extraW;
    else if (cx > W * 0.6) x += extraW;
    else if (cx > W * 0.4) x += extraW / 2;
  }
  if (extraH > 0) {
    if (h >= H * 0.8) h += extraH;
    else if (cy > H * 0.6) y += extraH;
    else if (cy > H * 0.4) y += extraH / 2;
  }
  return { ...it, x, y, w, h };
}

// ---------- backdrop ----------

/** Pre-blurred once per image (sigma ~22, saturation x1.25), shown scaled up. */
function useLandscape() {
  const [urls, setUrls] = useState<(string | null)[]>([null, null]);
  const [front, setFront] = useState(0);
  const idx = useRef(0);

  useEffect(() => {
    let off = false;
    let failures = 0;
    function load(i: number, slot: number) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (off) return;
        let out: string | null = null;
        try {
          const c = document.createElement("canvas");
          c.width = 960;
          c.height = Math.round((960 * img.height) / img.width);
          const ctx = c.getContext("2d")!;
          ctx.filter = "blur(22px) saturate(1.25)";
          ctx.drawImage(img, -40, -40, c.width + 80, c.height + 80);
          out = c.toDataURL("image/jpeg", 0.8);
        } catch {
          out = img.src;
        }
        setUrls((u) => u.map((x, k) => (k === slot ? out : x)));
      };
      img.onerror = () => {
        // skip a bad photo, but give up after one lap rather than looping forever
        if (off || ++failures > LANDSCAPE_URLS.length) return;
        idx.current = (idx.current + 1) % LANDSCAPE_URLS.length;
        load(idx.current, slot);
      };
      img.src = LANDSCAPE_URLS[i];
    }
    load(0, 0);
    idx.current = 0;
    const id = setInterval(() => {
      idx.current = (idx.current + 1) % LANDSCAPE_URLS.length;
      const next = 1 - front;
      load(idx.current, next);
      setTimeout(() => !off && setFront((f) => 1 - f), 600);
    }, 30_000);
    return () => {
      off = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- front toggles inside the interval
  }, []);

  return { urls, front };
}

function Backdrop({ art, playing, accent }: { art: string | null; playing: boolean; accent: string }) {
  const { urls, front } = useLandscape();
  return (
    <div className="absolute inset-0 bg-black overflow-hidden">
      {[0, 1].map((slot) => (
        <div
          key={slot}
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: urls[slot] ? `url(${urls[slot]})` : undefined,
            opacity: !playing && front === slot && urls[slot] ? 0.72 : 0,
            transition: "opacity 3s ease",
          }}
        />
      ))}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: art ? `url(${art})` : undefined, opacity: playing && art ? 0.65 : 0, transition: "opacity 2.5s ease" }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent}22, transparent 60%)`, opacity: playing ? 1 : 0.5, transition: "opacity 2s" }}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.6))" }} />
    </div>
  );
}

// ---------- pieces ----------

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return null;
  const parts = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).match(/^(.*?)\s?([AP]M)?$/i);
  const date = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).replace(", ", " · ");
  return (
    <div style={reveal(0.7)}>
      <div className="flex items-baseline gap-3" style={{ lineHeight: 0.9 }}>
        <span className="num-rounded text-gradient-white font-semibold" style={{ fontSize: 210 }}>{parts?.[1]}</span>
        {parts?.[2] && <span className="num-rounded font-semibold text-white/60" style={{ fontSize: 44 }}>{parts[2]}</span>}
      </div>
      <div className="mt-5 font-semibold uppercase text-white/50" style={{ fontFamily: "var(--font-wide)", fontSize: 22, letterSpacing: "0.14em" }}>
        {date}
      </div>
    </div>
  );
}

function WeatherTile({ w }: { w: Weather }) {
  return (
    <div className="glass-card flex items-center gap-5 px-8" style={{ width: 380, height: 112, borderRadius: 34 }}>
      <WeatherIcon code={w.weatherCode} isDay={w.isDay} className="w-14 h-14 shrink-0" />
      <div className="num-rounded font-semibold text-white" style={{ fontSize: 64, lineHeight: 1 }}>{Math.round(w.tempF)}°</div>
      <div className="min-w-0">
        <div className="text-white font-bold" style={{ fontSize: 22 }}>{weatherLabel(w.weatherCode)}</div>
        <div className="num-rounded font-semibold text-white/50" style={{ fontSize: 15 }}>H {Math.round(w.highF)}° · L {Math.round(w.lowF)}°</div>
      </div>
    </div>
  );
}

const uvWord = (uv: number) => (uv < 3 ? "Low" : uv < 6 ? "Moderate" : uv < 8 ? "High" : uv < 11 ? "Very high" : "Extreme");

/** Big, readable weather for the morning scene: giant temperature, hourly with rain chance,
 *  the week ahead, and the numbers people actually check (UV, wind, humidity, sun times). */
function WeatherHero({ w }: { w: Weather }) {
  const [from, to] = weatherGradient(w.weatherCode, w.isDay);
  const hours = w.hourly.filter((h) => new Date(h.time).getTime() > Date.now() - 3600_000).slice(0, 9);
  const days = (w.forecast ?? []).slice(0, 5);
  const t = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—");
  const stat = (label: string, value: string, sub?: string) => (
    <div className="glass-card flex-1 flex flex-col justify-center px-5" style={{ height: 84, borderRadius: 26 }}>
      <div className="caps-label" style={{ fontSize: 11 }}>{label}</div>
      <div className="num-rounded font-bold text-white" style={{ fontSize: 28, lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="text-white/50 font-semibold" style={{ fontSize: 13 }}>{sub}</div>}
    </div>
  );
  return (
    <div className="flex flex-col gap-4" style={{ width: 820, height: 640 }}>
      <div
        className="glass-card flex items-center gap-7 px-9"
        style={{
          height: 250, borderRadius: 56,
          background: `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, ${from} 80%, transparent), transparent 70%), radial-gradient(90% 120% at 100% 100%, color-mix(in srgb, ${to} 40%, transparent), transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05))`,
        }}
      >
        <WeatherIcon code={w.weatherCode} isDay={w.isDay} className="w-28 h-28 shrink-0" />
        <div className="num-rounded text-gradient-white font-semibold" style={{ fontSize: 184, lineHeight: 0.9, letterSpacing: "-0.04em" }}>{Math.round(w.tempF)}°</div>
        <div className="min-w-0">
          <div className="text-white font-bold leading-tight" style={{ fontSize: 40 }}>{weatherLabel(w.weatherCode)}</div>
          {w.feelsLikeF != null && <div className="text-white/70 font-semibold" style={{ fontSize: 24 }}>Feels like {Math.round(w.feelsLikeF)}°</div>}
          <div className="num-rounded text-white font-bold mt-2 whitespace-nowrap" style={{ fontSize: 40, lineHeight: 1.05 }}>H {Math.round(w.highF)}° <span className="mx-1 text-white/40">·</span> L {Math.round(w.lowF)}°</div>
        </div>
      </div>

      <div className="flex gap-3">
        {hours.map((h, i) => {
          const rain = h.precipProbability ?? 0;
          return (
            <div key={h.time} className="glass-card flex-1 flex flex-col items-center justify-center" style={{ height: 150, borderRadius: 30 }}>
              <div className="font-semibold text-white/60" style={{ fontSize: 15 }}>{i === 0 ? "Now" : new Date(h.time).toLocaleTimeString([], { hour: "numeric" })}</div>
              <WeatherIcon code={h.weatherCode} isDay={w.isDay} className="w-9 h-9 my-2" />
              <div className="num-rounded font-bold text-white" style={{ fontSize: 28 }}>{Math.round(h.tempF)}°</div>
              <div className="num-rounded font-semibold" style={{ fontSize: 14, color: rain >= 20 ? "#7cc4ff" : "transparent" }}>{rain}%</div>
            </div>
          );
        })}
      </div>

      {days.length > 0 && (
        <div className="flex gap-3">
          {days.map((d, i) => (
            <div key={d.date} className="glass-card flex-1 flex flex-col items-center justify-center" style={{ height: 110, borderRadius: 26 }}>
              <div className="caps-label" style={{ fontSize: 11 }}>{i === 0 ? "Today" : new Date(d.date + "T12:00").toLocaleDateString([], { weekday: "short" })}</div>
              <WeatherIcon code={d.weatherCode} isDay className="w-8 h-8 my-1" />
              <div className="num-rounded font-bold text-white" style={{ fontSize: 20 }}>{Math.round(d.highF)}° <span className="text-white/45">{Math.round(d.lowF)}°</span></div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        {w.uvIndex != null && stat("UV index", String(Math.round(w.uvIndex)), uvWord(w.uvIndex))}
        {w.windMph != null && stat("Wind", `${Math.round(w.windMph)} mph`)}
        {w.humidity != null && stat("Humidity", `${Math.round(w.humidity)}%`)}
        {stat("Sun", t(w.sunrise), `sets ${t(w.sunset)}`)}
      </div>
    </div>
  );
}

function Drifting({ children, width, deps }: { children: React.ReactNode; width: number; deps: unknown[] }) {
  const box = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const { x, overflow } = useDrift(box, row, deps);
  return (
    <div
      ref={box}
      className="overflow-hidden"
      style={{
        width,
        maskImage: overflow ? "linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)" : undefined,
        display: "flex",
        justifyContent: overflow ? "flex-start" : "flex-start",
      }}
    >
      <div ref={row} className="flex gap-3 shrink-0" style={{ transform: `translateX(${x}px)` }}>
        {children}
      </div>
    </div>
  );
}

function Forecast({ hours, isDay, width }: { hours: Hour[]; isDay?: boolean; width: number }) {
  const now = new Date();
  const list = hours.filter((h) => new Date(h.time).getTime() > now.getTime() - 3600_000).slice(0, 24);
  return (
    <Drifting width={width} deps={[list.length]}>
      {list.map((h, i) => (
        <div key={h.time} className="glass-card flex flex-col items-center justify-center shrink-0" style={{ width: 86, height: 118, borderRadius: 30 }}>
          <div className="font-semibold text-white/60" style={{ fontSize: 14 }}>
            {i === 0 ? "Now" : new Date(h.time).toLocaleTimeString([], { hour: "numeric" })}
          </div>
          <WeatherIcon code={h.weatherCode} isDay={isDay ?? true} className="w-7 h-7 my-2" />
          <div className="num-rounded font-bold text-white" style={{ fontSize: 24 }}>{Math.round(h.tempF)}°</div>
        </div>
      ))}
    </Drifting>
  );
}

interface FmDevice { id: string; name: string; deviceClass: string; batteryLevel: number | null; isPerson: boolean }

const CLASS_ORDER = ["iPhone", "iPad", "Watch", "Mac", "AirPods"];
function classRank(c: string) {
  const i = CLASS_ORDER.findIndex((k) => c.toLowerCase().includes(k.toLowerCase()));
  return i === -1 ? 99 : i;
}

function DeviceGlyph({ cls, color }: { cls: string; color: string }) {
  const k = cls.toLowerCase();
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (k.includes("watch")) return <svg {...p}><rect x="7" y="6" width="10" height="12" rx="3" /><path d="M9 6l.7-3h4.6L15 6M9 18l.7 3h4.6l.7-3" /></svg>;
  if (k.includes("pad") || k.includes("tablet")) return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M11 18h2" /></svg>;
  if (k.includes("mac") || k.includes("book") || k.includes("laptop")) return <svg {...p}><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2.5 19h19" /></svg>;
  if (k.includes("pod") || k.includes("head") || k.includes("buds")) return <svg {...p}><path d="M8 4a3.5 3.5 0 0 0-3.5 3.5c0 2 1.5 3 3.5 3v8a1.5 1.5 0 0 0 3 0V7.5A3.5 3.5 0 0 0 8 4zM16 4a3.5 3.5 0 0 1 3.5 3.5c0 2-1.5 3-3.5 3v8a1.5 1.5 0 0 1-3 0" /></svg>;
  if (k.includes("phone")) return <svg {...p}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>;
  return <svg {...p}><rect x="6" y="4" width="12" height="16" rx="2.5" /></svg>;
}

/** "Alex's iPhone 15 Pro" -> "iPhone 15 Pro" when the owner prefix is obvious, else the full name. */
const shortName = (n: string) => n.replace(/^.{1,24}?[’']s\s+/, "") || n;

/** Your own iCloud devices' batteries (via Find My), not whatever device is
 *  rendering the screen. Each chip: device-type icon, level, and the device's name as a subnote. */
function BatteryChips({ width }: { width: number }) {
  const devices = usePolled<FmDevice[]>("/api/icloud/findmy", 10 * 60_000, (j: { devices?: FmDevice[] }) => j.devices ?? []);
  const list = (devices ?? [])
    .filter((d) => !d.isPerson && typeof d.batteryLevel === "number" && d.batteryLevel >= 0)
    .sort((a, b) => classRank(a.deviceClass) - classRank(b.deviceClass))
    .slice(0, 5);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3" style={{ width }}>
      {list.map((d) => {
        const pct = Math.round((d.batteryLevel as number) * 100);
        const color = pct <= 20 ? "#ff6b6b" : "#fff";
        return (
          <div key={d.id} className="glass-card flex flex-col justify-center px-5" style={{ height: 84, width: 178, borderRadius: 28 }}>
            <div className="flex items-center gap-2.5">
              <DeviceGlyph cls={d.deviceClass} color="rgba(255,255,255,0.75)" />
              <svg width="30" height="16" viewBox="0 0 34 18" fill="none">
                <rect x="1" y="1" width="28" height="16" rx="5" stroke={color} strokeOpacity="0.5" strokeWidth="1.6" />
                <rect x="3.5" y="3.5" width={Math.max(2, 23 * (pct / 100))} height="11" rx="3" fill={color} />
                <rect x="31" y="6" width="2" height="6" rx="1" fill={color} fillOpacity="0.5" />
              </svg>
              <span className="num-rounded font-bold" style={{ fontSize: 24, color }}>{pct}%</span>
            </div>
            <FitText className="caps-label mt-1.5" style={{ fontSize: 11 }}>{shortName(d.name)}</FitText>
          </div>
        );
      })}
    </div>
  );
}

// -- now playing --

function Icon({ d, size = 40 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d={d} /></svg>
  );
}
const PREV = "M6 6h2v12H6zM9.5 12 18 6v12z";
const NEXT = "M16 6h2v12h-2zM6 18V6l8.5 6z";
const PLAY = "M8 5v14l11-7z";
const PAUSE = "M7 5h4v14H7zM13 5h4v14h-4z";

function NowPlayingCard({ accent }: { accent: string }) {
  const np = useNowPlaying();
  const track = np?.track ?? null;
  const progress = useEstimatedProgress(track, np?.isPlaying ?? false, np?.fetchedAt);
  const lyrics = useLyrics(track);
  if (!track) return null;

  let active = -1;
  if (lyrics) for (let i = 0; i < lyrics.length; i++) if (lyrics[i].timeMs <= progress) active = i;
  const cur = lyrics && active >= 0 ? lyrics[active].text : "";
  const nxt = lyrics && lyrics[active + 1] ? lyrics[active + 1].text : "";
  const pct = Math.min(100, (progress / track.durationMs) * 100);
  const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

  return (
    <div className="glass-card flex flex-col" style={{ width: 560, height: 480, borderRadius: 48, padding: 34 }}>
      <div className="flex gap-7">
        {track.albumArtUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external Spotify CDN image
          <img src={track.albumArtUrl} alt="" className="object-cover shrink-0" style={{ width: 190, height: 190, borderRadius: 48, boxShadow: `0 10px 40px ${accent}80` }} />
        )}
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <FitText lines={2} className="text-white font-bold leading-tight" style={{ fontSize: 34 }}>{track.name}</FitText>
          <FitText className="text-white/60 font-medium" style={{ fontSize: 22 }}>{track.artists}</FitText>
          <div className="flex items-center gap-6 mt-5 text-white" style={{ pointerEvents: "auto" }}>
            <button onClick={() => controlSpotify("previous")} className="opacity-90"><Icon d={PREV} /></button>
            <button
              onClick={() => controlSpotify(np?.isPlaying ? "pause" : "play")}
              className="glass-card flex items-center justify-center"
              style={{ width: 64, height: 64, borderRadius: 32 }}
            >
              <Icon d={np?.isPlaying ? PAUSE : PLAY} size={32} />
            </button>
            <button onClick={() => controlSpotify("next")} className="opacity-90"><Icon d={NEXT} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center min-h-0 mt-2">
        {cur ? (
          <>
            <FitText key={active} lines={2} className="text-white font-bold leading-[1.12]" style={{ fontSize: 46, animation: "reveal-up 0.5s ease-out both" }}>{cur}</FitText>
            {nxt && <FitText className="font-bold leading-tight mt-1" style={{ fontSize: 34, color: "rgba(255,255,255,0.35)" }}>{nxt}</FitText>}
          </>
        ) : (
          <div className="text-white/35 font-bold" style={{ fontSize: 28 }}>{lyrics === null ? "" : lyrics.length ? "♪" : "No synced lyrics"}</div>
        )}
      </div>

      <div>
        <div className="rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.18)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}a6, ${accent})` }} />
        </div>
        <div className="flex justify-between num-rounded font-semibold text-white/45 mt-2" style={{ fontSize: 17 }}>
          <span>{fmt(progress)}</span><span>{fmt(track.durationMs)}</span>
        </div>
      </div>
    </div>
  );
}

function VolumePill({ accent }: { accent: string }) {
  const np = useNowPlaying();
  const [vol, setVol] = useState<number | null>(null);
  const server = np?.volumePercent ?? null;
  const shown = vol ?? server ?? 50;
  const drag = useRef(false);

  useEffect(() => {
    if (!drag.current) setVol(null);
  }, [server]);

  function setFromEvent(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const v = Math.max(0, Math.min(100, Math.round((1 - (e.clientY - r.top) / r.height) * 100)));
    setVol(v);
    return v;
  }

  return (
    <div className="glass-card flex flex-col items-center py-6" style={{ width: 62, height: 480, borderRadius: 31 }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="white" fillOpacity="0.7"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="white" strokeOpacity="0.7" strokeWidth="1.6" fill="white" /></svg>
      <div
        className="flex-1 my-4 w-2 rounded-full relative overflow-hidden touch-none"
        style={{ background: "rgba(255,255,255,0.18)", pointerEvents: "auto", cursor: "pointer" }}
        onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); setFromEvent(e); }}
        onPointerMove={(e) => { if (drag.current) setFromEvent(e); }}
        onPointerUp={(e) => { const v = setFromEvent(e); drag.current = false; controlSpotify("volume", v); }}
      >
        <div className="absolute bottom-0 left-0 right-0 rounded-full" style={{ height: `${shown}%`, background: `linear-gradient(0deg, ${accent}a6, ${accent})` }} />
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white" fillOpacity="0.6"><path d="M4 9v6h4l5 4V5L8 9z" /></svg>
    </div>
  );
}

// -- agenda --

function dayLabel(d: Date) {
  const t = new Date();
  if (d.toDateString() === t.toDateString()) return "Today";
  const tm = new Date(t.getTime() + 86_400_000);
  if (d.toDateString() === tm.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "long" });
}

function eventWhen(e: CalEvent) {
  const s = new Date(e.start);
  if (e.allDay) return `${dayLabel(s)} · All day`;
  const t = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${dayLabel(s)} ${t(s)}${e.end ? ` – ${t(new Date(e.end))}` : ""}`;
}

function Agenda({ events, width }: { events: CalEvent[]; width: number }) {
  if (events.length === 0) return null;
  return (
    <div style={reveal(1.0)}>
      <div className="caps-label mb-3" style={{ fontSize: 15, paddingLeft: 24 }}>Next up</div>
      <Drifting width={width} deps={[events.length]}>
        {events.map((e, i) => {
          const c = eventColor(e.colorId, e.source);
          return (
            <div key={i} className="glass-card flex items-center gap-4 px-6 shrink-0" style={{ width: 380, height: 82, borderRadius: 28 }}>
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c, boxShadow: `0 0 8px ${c}cc` }} />
              <div className="min-w-0 flex-1">
                <Marquee className="text-white font-semibold" >{e.summary}</Marquee>
                <div className="num-rounded font-semibold text-white/60 truncate" style={{ fontSize: 16 }}>{eventWhen(e)}</div>
              </div>
            </div>
          );
        })}
      </Drifting>
    </div>
  );
}

/** Full vertical agenda: day headings, glass event cards, fading out at the bottom. */
function AgendaList({ events, connected }: { events: CalEvent[]; connected: boolean }) {
  const groups: { label: string; items: CalEvent[] }[] = [];
  for (const e of events) {
    const label = dayLabel(new Date(e.start));
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return (
    <div
      className="w-full h-full overflow-hidden"
      style={{ maskImage: "linear-gradient(180deg, #000 88%, transparent)" }}
    >
      {events.length === 0 ? (
        <div className="glass-card flex items-center justify-center text-center px-8 h-40 text-white/45 font-semibold" style={{ fontSize: 22, borderRadius: 36 }}>
          {connected ? "Nothing on the calendar" : "Calendar not connected — sign in from Control"}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="mb-6">
            <div className="caps-label mb-3" style={{ fontSize: 15, paddingLeft: 8 }}>{g.label}</div>
            <div className="flex flex-col gap-3">
              {g.items.map((e, i) => {
                const col = eventColor(e.colorId, e.source);
                const s = new Date(e.start);
                return (
                  <div key={i} className="glass-card flex items-center gap-4 px-6" style={{ minHeight: 84, borderRadius: 28 }}>
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: col, boxShadow: `0 0 8px ${col}cc` }} />
                    <div className="min-w-0 flex-1">
                      <FitText lines={2} className="text-white font-semibold leading-tight" style={{ fontSize: 22 }}>{e.summary}</FitText>
                      <div className="num-rounded font-semibold text-white/60" style={{ fontSize: 17 }}>
                        {e.allDay ? "All day" : `${s.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${e.end ? ` – ${new Date(e.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** Plain-language read on the day: sky, temperatures, rain, what to wear, and the schedule. */
function buildSummary(w: Weather, events: CalEvent[], now: Date): { head: string; body: string } {
  const sky = weatherLabel(w.weatherCode).toLowerCase();
  const hi = Math.round(w.highF), lo = Math.round(w.lowF);
  const head = `${sky.charAt(0).toUpperCase()}${sky.slice(1)}, high of ${hi}°, low of ${lo}°.`;
  const bits: string[] = [];

  const ahead = w.hourly.filter((h) => new Date(h.time).getTime() > now.getTime() - 3600_000).slice(0, 14);
  const wet = ahead.reduce<Hour | null>((m, h) => ((h.precipProbability ?? 0) > (m?.precipProbability ?? 0) ? h : m), null);
  if (wet && (wet.precipProbability ?? 0) >= 30) {
    bits.push(`${wet.precipProbability}% chance of rain around ${new Date(wet.time).toLocaleTimeString([], { hour: "numeric" })}`);
  }
  if (hi <= 40) bits.push("bundle up");
  else if (hi <= 60) bits.push("bring a jacket");
  else if (hi >= 90) bits.push("it will be hot, stay hydrated");
  if ((w.uvIndex ?? 0) >= 6) bits.push("high UV, wear sunscreen");
  if ((w.windMph ?? 0) >= 18) bits.push("windy");

  const today = events.filter((e) => new Date(e.start).toDateString() === now.toDateString() && new Date(e.end ?? e.start).getTime() > now.getTime());
  const timed = today.filter((e) => !e.allDay);
  const t = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  let sched = "";
  if (timed.length > 0) sched = `${timed.length} event${timed.length > 1 ? "s" : ""} today — first up, ${timed[0].summary} at ${t(new Date(timed[0].start))}.`;
  else if (today.length > 0) sched = `${today.length} all-day item${today.length > 1 ? "s" : ""} today.`;

  const advice = bits.length ? `${bits.join("; ").replace(/^./, (c) => c.toUpperCase())}. ` : "";
  return { head, body: `${advice}${sched}`.trim() };
}

function DaySummary({ w, events }: { w: Weather; events: CalEvent[] }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const s = buildSummary(w, events, now);
  return (
    <div className="glass-card flex flex-col justify-center w-full h-full" style={{ borderRadius: 36, padding: "18px 32px" }}>
      <div className="caps-label" style={{ fontSize: 12, marginBottom: 6 }}>Today</div>
      <FitText lines={1} className="text-white font-bold" style={{ fontSize: 32, lineHeight: 1.15 }}>{s.head}</FitText>
      {s.body && <FitText lines={2} className="text-white/75 font-semibold mt-1" style={{ fontSize: 22, lineHeight: 1.25 }}>{s.body}</FitText>}
    </div>
  );
}

/** The next timed event with a live countdown — what you need to know "right now". */
function UpNextLive({ events }: { events: CalEvent[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const e = events.find((x) => !x.allDay && new Date(x.end ?? x.start).getTime() > now);
  const c = e ? eventColor(e.colorId, e.source) : NEUTRAL_ACCENT;
  const start = e ? new Date(e.start).getTime() : 0;
  const mins = Math.round((start - now) / 60_000);
  const nowOn = Boolean(e) && start <= now;
  const big = !e ? "" : nowOn ? "Now" : mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.max(mins, 1)}m`;
  const t = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div
      className="glass-card flex items-center gap-8 px-9 w-full h-full"
      style={{ borderRadius: 48, background: `radial-gradient(120% 140% at 0% 0%, ${c}40, transparent 65%), linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))` }}
    >
      {e ? (
        <>
          <div className="shrink-0 text-center">
            <div className="caps-label" style={{ fontSize: 13 }}>{nowOn ? "Happening" : "Starts in"}</div>
            <div className="num-rounded text-gradient-white font-semibold" style={{ fontSize: 88, lineHeight: 1 }}>{big}</div>
          </div>
          <div className="min-w-0 flex-1">
            <FitText lines={2} className="text-white font-bold leading-tight" style={{ fontSize: 34 }}>{e.summary}</FitText>
            <div className="num-rounded font-semibold text-white/60 mt-1" style={{ fontSize: 20 }}>
              {t(new Date(e.start))}{e.end ? ` – ${t(new Date(e.end))}` : ""}
            </div>
          </div>
        </>
      ) : (
        <div className="text-white/45 font-semibold" style={{ fontSize: 28 }}>Nothing else scheduled today</div>
      )}
    </div>
  );
}

/** Evening look-ahead: first thing tomorrow, then the rest, plus tomorrow's weather. */
function TomorrowPreview({ events, day }: { events: CalEvent[]; day?: Day }) {
  const tm = new Date(Date.now() + 86_400_000).toDateString();
  const list = events.filter((e) => new Date(e.start).toDateString() === tm).slice(0, 4);
  const t = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const first = list.find((e) => !e.allDay);
  return (
    <div className="glass-card flex flex-col gap-3 w-full h-full" style={{ borderRadius: 44, padding: 32 }}>
      <div className="flex items-baseline justify-between">
        <div className="caps-label" style={{ fontSize: 14 }}>Tomorrow</div>
        {day && <div className="num-rounded font-semibold text-white/60" style={{ fontSize: 20 }}>{Math.round(day.highF)}° / {Math.round(day.lowF)}°</div>}
      </div>
      {first && (
        <div className="text-white font-bold leading-tight" style={{ fontSize: 30 }}>
          First up {t(new Date(first.start))}
        </div>
      )}
      <div className="flex flex-col gap-2 min-h-0">
        {list.length === 0 ? (
          <div className="text-white/45 font-semibold" style={{ fontSize: 24 }}>Nothing scheduled</div>
        ) : (
          list.map((e, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: eventColor(e.colorId, e.source) }} />
              <FitText className="text-white/90 font-semibold flex-1 min-w-0" style={{ fontSize: 20 }}>{e.summary}</FitText>
              <span className="num-rounded font-semibold text-white/50" style={{ fontSize: 16 }}>{e.allDay ? "all day" : t(new Date(e.start))}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function UpNext({ e }: { e: CalEvent | undefined }) {
  const c = e ? eventColor(e.colorId, e.source) : NEUTRAL_ACCENT;
  return (
    <div
      className="glass-card flex flex-col justify-center"
      style={{ width: "100%", height: 200, borderRadius: 48, padding: 40, background: `radial-gradient(ellipse at 50% 0%, ${c}30, transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))` }}
    >
      <div className="caps-label mb-3" style={{ fontSize: 15 }}>Up next</div>
      {e ? (
        <>
          <FitText lines={2} className="text-white font-bold leading-tight" style={{ fontSize: 38 }}>{e.summary}</FitText>
          <div className="num-rounded font-semibold text-white/60 mt-2" style={{ fontSize: 22 }}>{eventWhen(e)}</div>
        </>
      ) : (
        <div className="text-white/40 font-semibold" style={{ fontSize: 28 }}>Nothing coming up</div>
      )}
    </div>
  );
}

function NotePills({ notes, onDismiss }: { notes: Note[]; onDismiss: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-3 items-end w-full">
      {notes.slice(0, 2).map((n) => (
        <button
          key={n.id}
          onClick={() => onDismiss(n.id)}
          className="glass-card flex items-center gap-3 px-5 text-left"
          style={{ height: 52, borderRadius: 26, maxWidth: 460, pointerEvents: "auto" }}
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: n.level === "important" ? "#ff6b6b" : n.level === "action_needed" ? "#ffb84d" : "#5ac8fa", boxShadow: "0 0 8px currentColor" }} />
          <FitText className="text-white font-semibold flex-1 min-w-0" style={{ fontSize: 17 }}>{n.message}</FitText>
        </button>
      ))}
    </div>
  );
}

// ---------- screen ----------

/** Saved base layout + scenes from settings, or a ?sbdraft=<base64 JSON> override
 *  used by the editor's live preview (which bypasses scenes and rules). */
function useStandByConfig(draft: string | null, profile: { layout: StandByItem[]; scenes: StandByScene[] } | null) {
  // Device polls hand us a fresh object every few seconds; key on content so we only re-apply real changes.
  const profileKey = profile ? JSON.stringify(profile) : "";
  const settings = useSettings();
  const [loaded, setLoaded] = useState(false);
  const [cfg, setCfg] = useState<{ layout: StandByItem[]; scenes: StandByScene[] }>(() => ({
    layout: mergeStandByLayout(null),
    scenes: defaultScenes(),
  }));
  useEffect(() => {
    if (draft) {
      try {
        setCfg({ layout: mergeStandByLayout(JSON.parse(decodeURIComponent(escape(atob(draft))))), scenes: [] });
        setLoaded(true);
        return;
      } catch {
        // fall through to saved layout
      }
    }
    if (profile) {
      setCfg({ layout: mergeStandByLayout(profile.layout), scenes: mergeScenes(profile.scenes) });
      setLoaded(true);
      return;
    }
    if (settings) {
      setCfg({ layout: mergeStandByLayout(settings.standbyLayout), scenes: mergeScenes(settings.standbyScenes) });
      setLoaded(true);
    }
  }, [draft, profileKey, settings]);
  return { ...cfg, isDraft: Boolean(draft), loaded };
}

const REVEAL_DELAY: Record<string, number> = {
  notifications: 0.5, clock: 0.7, weather: 0.8, forecast: 0.8, battery: 0.9, nowplaying: 0.85, agenda: 1.0,
};

export function StandBy({ draft = null, sceneId = null, profile = null }: { draft?: string | null; sceneId?: string | null; profile?: { layout: StandByItem[]; scenes: StandByScene[] } | null }) {
  const { s: scale, extraW, extraH } = useViewport();
  const np = useNowPlaying();
  const playing = Boolean(np?.connected && np.isPlaying && np.track);
  const { backdrop, accent } = useArtTheme(playing ? np?.track?.albumArtUrl : null);
  const color = playing ? accent : NEUTRAL_ACCENT;
  const cfg = useStandByConfig(draft, profile);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const weather = usePolled<Weather>("/api/weather", 10 * 60_000, (j: Weather) => j);
  // Calendar + notifications come from the shared feed the island already polls.
  const { notes, events, calendarConnected: calConnected } = useFeeds();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const upcoming = (events ?? []).filter((e) => new Date(e.end ?? e.start).getTime() > Date.now()).slice(0, 12);
  const unreadAll = (notes ?? []).filter((n) => !n.read && n.level === "info" && !dismissed.has(n.id));
  // Pills appear routinely (on arrival, then every few minutes), not permanently.
  const pillsOpen = useRoutine(unreadAll.map((n) => n.id).join(","));
  const unread = pillsOpen ? unreadAll : [];

  // Scenes switch on their own schedule; per-item rules then hide individual pieces.
  const ctx: VisibilityContext = {
    now,
    weatherCode: weather?.weatherCode ?? null,
    todaysEventTitles: (events ?? []).filter((e) => new Date(e.start).toDateString() === now.toDateString()).map((e) => e.summary),
  };
  const active = cfg.isDraft ? null : (sceneId ? (sceneId === "base" ? null : cfg.scenes.find((s) => s.id === sceneId) ?? null) : pickScene(cfg.scenes, ctx));
  const layout = (active?.items ?? cfg.layout).filter((it) => cfg.isDraft || isWidgetVisible(it.visibility, ctx));
  // When the backdrop is music-driven, the music must still be visible: if this layout has no
  // now-playing card, the top pill carries it.
  const musicCardShown = layout.some((it) => it.id === "nowplaying" && it.enabled);
  const dim = active?.dim ?? 0;

  function dismiss(id: string) {
    setDismissed((s) => new Set(s).add(id));
    fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }

  function body(it: StandByItem): React.ReactNode {
    switch (it.id) {
      case "clock": return <Clock />;
      case "weather": return weather && <WeatherTile w={weather} />;
      case "weatherhero": return weather && <WeatherHero w={weather} />;
      case "forecast": return weather && <Forecast hours={weather.hourly} isDay={weather.isDay} width={it.w} />;
      case "battery": return <BatteryChips width={it.w} />;
      case "nowplaying":
        return playing ? (
          <div className="flex gap-4"><NowPlayingCard accent={color} /><VolumePill accent={color} /></div>
        ) : (
          <UpNext e={upcoming[0]} />
        );
      case "agenda": return <Agenda events={playing ? upcoming : upcoming.slice(1)} width={it.w} />;
      case "notifications": return <NotePills notes={unread} onDismiss={dismiss} />;
      case "daysummary": return weather && <DaySummary w={weather} events={upcoming} />;
      case "upnext": return <UpNextLive events={upcoming} />;
      case "tomorrow": return <TomorrowPreview events={events ?? []} day={weather?.forecast?.[1]} />;
      case "calendar": return <AgendaList events={upcoming} connected={calConnected} />;
      default: {
        const type = it.id as WidgetType;
        return (
          <div className={`tile tile-${type}`} style={{ width: it.w, height: it.h }}>
            <WidgetRenderer type={type} size={sizeForFootprint((it.w / W) * 12, (it.h / H) * 7)} />
          </div>
        );
      }
    }
  }

  /** Hand-built pieces are designed at their default size and scale uniformly with the box
   *  the user drags out; row-style pieces keep their height-scale and gain width instead. */
  function scaled(it: StandByItem): React.ReactNode {
    const def = STANDBY_DEFAULT_SIZE[it.id];
    const custom = ["clock", "weatherhero", "weather", "forecast", "battery", "nowplaying", "agenda", "notifications", "calendar", "upnext", "tomorrow", "daysummary"].includes(it.id);
    if (!custom) return body(it);
    const row = ROW_ITEMS.includes(it.id);
    // The clock fills the width it is given (the right-column morning clock spans the whole column).
    const k0 = it.id === "clock" ? Math.min(it.w / 600, it.h / def.h) : null;
    const k = k0 ?? (row ? it.h / def.h : Math.min(it.w / def.w, it.h / def.h));
    const innerW = row ? it.w / k : def.w;
    return (
      <div style={{ width: innerW, height: it.h / k, transform: `scale(${k})`, transformOrigin: "0 0" }}>
        {body({ ...it, w: innerW, h: it.h / k })}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden text-white" style={{ ["--accent" as string]: color }}>
      <RippleReveal accent={color} duration={draft ? 1 : 1600}>
        <Backdrop art={backdrop} playing={playing} accent={color} />
        <div
          className="absolute"
          style={{ left: "50%", top: "50%", width: W + extraW, height: H + extraH, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          {(cfg.loaded ? layout : []).filter((it) => it.enabled).map((raw) => adapt(raw, extraW, extraH)).map((it) => (
            <div
              key={it.id}
              className="absolute"
              style={{ left: it.x, top: it.y, width: it.w, height: it.h, ...reveal(REVEAL_DELAY[it.id] ?? 0.9) }}
            >
              {scaled(it)}
            </div>
          ))}
        </div>
      </RippleReveal>
      {/* island: alerts / imminent events / live games (music has its own card here) */}
      {dim > 0 && <div className="absolute inset-0 pointer-events-none bg-black transition-opacity duration-[2000ms]" style={{ opacity: dim }} />}
      <SpotifyIsland includeMusic={!musicCardShown} />
    </div>
  );
}
