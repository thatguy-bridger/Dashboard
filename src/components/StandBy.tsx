"use client";

import { useEffect, useRef, useState } from "react";
import { WeatherIcon } from "@/lib/weatherVisuals";
import { weatherLabel } from "@/lib/weatherCodes";
import { eventColor } from "@/lib/eventColors";
import { useDrift } from "@/lib/useDrift";
import { useArtTheme, NEUTRAL_ACCENT } from "@/lib/useArtTheme";
import { LANDSCAPE_URLS } from "@/lib/landscapes";
import { controlSpotify, useEstimatedProgress, useLyrics, useNowPlaying } from "@/lib/spotifyClient";
import { Marquee } from "@/components/Marquee";
import { RippleReveal } from "@/components/RippleReveal";

const W = 1440;
const H = 900;

/** Staggered block reveal: opacity only, easeOut 0.9s (Islet DESIGN.md §8). */
const reveal = (delay: number): React.CSSProperties => ({
  animation: `fade-in 0.9s ease-out ${delay}s both`,
});

// ---------- data ----------

interface Hour { time: string; tempF: number; weatherCode: number }
interface Weather { tempF: number; isDay: boolean; weatherCode: number; highF: number; lowF: number; hourly: Hour[] }
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
    const id = setInterval(load, everyMs);
    return () => {
      off = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- url/interval are constants per call site
  }, [url, everyMs]);
  return v;
}

function useScale() {
  const [s, setS] = useState(1);
  useEffect(() => {
    const f = () => setS(Math.min(window.innerWidth / W, window.innerHeight / H));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return s;
}

function useBattery() {
  const [pct, setPct] = useState<{ level: number; charging: boolean } | null>(null);
  useEffect(() => {
    type Bat = { level: number; charging: boolean; addEventListener: (e: string, f: () => void) => void };
    const nav = navigator as Navigator & { getBattery?: () => Promise<Bat> };
    nav.getBattery?.().then((b) => {
      const up = () => setPct({ level: Math.round(b.level * 100), charging: b.charging });
      up();
      b.addEventListener("levelchange", up);
      b.addEventListener("chargingchange", up);
    }).catch(() => {});
  }, []);
  return pct;
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

function Forecast({ hours, isDay }: { hours: Hour[] }  & { isDay?: boolean }) {
  const now = new Date();
  const list = hours.filter((h) => new Date(h.time).getTime() > now.getTime() - 3600_000).slice(0, 24);
  return (
    <Drifting width={600} deps={[list.length]}>
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

function BatteryChip() {
  const b = useBattery();
  if (!b) return null;
  const color = b.charging ? "#34d399" : b.level <= 20 ? "#ff6b6b" : "#fff";
  return (
    <div className="glass-card inline-flex items-center gap-3 px-6" style={{ height: 52, borderRadius: 26 }}>
      <svg width="34" height="18" viewBox="0 0 34 18" fill="none">
        <rect x="1" y="1" width="28" height="16" rx="5" stroke={color} strokeOpacity="0.5" strokeWidth="1.6" />
        <rect x="3.5" y="3.5" width={Math.max(2, 23 * (b.level / 100))} height="11" rx="3" fill={color} />
        <rect x="31" y="6" width="2" height="6" rx="1" fill={color} fillOpacity="0.5" />
      </svg>
      <span className="num-rounded font-semibold" style={{ fontSize: 22, color }}>{b.level}%</span>
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
          <div className="text-white font-bold leading-tight line-clamp-2" style={{ fontSize: 34 }}>{track.name}</div>
          <div className="text-white/60 font-medium truncate" style={{ fontSize: 22 }}>{track.artists}</div>
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
            <div key={active} className="text-white font-bold leading-[1.12] line-clamp-2" style={{ fontSize: 46, animation: "reveal-up 0.5s ease-out both" }}>{cur}</div>
            {nxt && <div className="font-bold leading-tight truncate mt-1" style={{ fontSize: 34, color: "rgba(255,255,255,0.35)" }}>{nxt}</div>}
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

function Agenda({ events }: { events: CalEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div style={reveal(1.0)}>
      <div className="caps-label mb-3" style={{ fontSize: 15, paddingLeft: 24 }}>Next up</div>
      <Drifting width={W - 120} deps={[events.length]}>
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

function UpNext({ e }: { e: CalEvent | undefined }) {
  const c = e ? eventColor(e.colorId, e.source) : NEUTRAL_ACCENT;
  return (
    <div
      className="glass-card flex flex-col justify-center"
      style={{ width: 640, height: 200, borderRadius: 48, padding: 40, background: `radial-gradient(ellipse at 50% 0%, ${c}30, transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))` }}
    >
      <div className="caps-label mb-3" style={{ fontSize: 15 }}>Up next</div>
      {e ? (
        <>
          <div className="text-white font-bold leading-tight line-clamp-2" style={{ fontSize: 38 }}>{e.summary}</div>
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
    <div className="absolute flex flex-col gap-3 items-end" style={{ top: 22, right: 40, ...reveal(0.5) }}>
      {notes.slice(0, 2).map((n) => (
        <button
          key={n.id}
          onClick={() => onDismiss(n.id)}
          className="glass-card flex items-center gap-3 px-5 text-left"
          style={{ height: 52, borderRadius: 26, maxWidth: 460, pointerEvents: "auto" }}
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: n.level === "important" ? "#ff6b6b" : n.level === "action_needed" ? "#ffb84d" : "#5ac8fa", boxShadow: "0 0 8px currentColor" }} />
          <span className="text-white font-semibold truncate" style={{ fontSize: 17 }}>{n.message}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- screen ----------

export function StandBy() {
  const scale = useScale();
  const np = useNowPlaying();
  const playing = Boolean(np?.connected && np.isPlaying && np.track);
  const { backdrop, accent } = useArtTheme(playing ? np?.track?.albumArtUrl : null);
  const color = playing ? accent : NEUTRAL_ACCENT;

  const weather = usePolled<Weather>("/api/weather", 10 * 60_000, (j: Weather) => j);
  const events = usePolled<CalEvent[]>("/api/calendar", 5 * 60_000, (j: { events?: CalEvent[] }) => j.events ?? []);
  const notes = usePolled<Note[]>("/api/notifications", 30_000, (j: { notifications: Note[] }) => j.notifications);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const upcoming = (events ?? []).filter((e) => new Date(e.end ?? e.start).getTime() > Date.now()).slice(0, 12);
  const unread = (notes ?? []).filter((n) => !n.read && n.level === "info" && !dismissed.has(n.id));

  function dismiss(id: string) {
    setDismissed((s) => new Set(s).add(id));
    fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden text-white" style={{ ["--accent" as string]: color }}>
      <RippleReveal accent={color}>
        <Backdrop art={backdrop} playing={playing} accent={color} />
        <div
          className="absolute"
          style={{ left: "50%", top: "50%", width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <NotePills notes={unread} onDismiss={dismiss} />

          {/* left column */}
          <div className="absolute flex flex-col" style={{ left: 60, top: 70, width: 620 }}>
            <Clock />
            {weather && (
              <div className="mt-8 flex flex-col gap-5" style={reveal(0.8)}>
                <WeatherTile w={weather} />
                <Forecast hours={weather.hourly} isDay={weather.isDay} />
              </div>
            )}
            <div className="mt-5" style={reveal(0.9)}><BatteryChip /></div>
          </div>

          {/* right column */}
          <div className="absolute flex gap-4" style={{ left: 740, top: 96, ...reveal(0.85) }}>
            {playing ? (
              <>
                <NowPlayingCard accent={color} />
                <VolumePill accent={color} />
              </>
            ) : (
              <UpNext e={upcoming[0]} />
            )}
          </div>

          {/* bottom agenda */}
          <div className="absolute" style={{ left: 60, top: 700 }}>
            <Agenda events={playing ? upcoming : upcoming.slice(1)} />
          </div>
        </div>
      </RippleReveal>
      {/* island: alerts / imminent events / live games (music has its own card here) */}
      <IslandSlot />
    </div>
  );
}

import { SpotifyIsland } from "@/components/SpotifyIsland";
function IslandSlot() {
  return <SpotifyIsland includeMusic={false} />;
}
