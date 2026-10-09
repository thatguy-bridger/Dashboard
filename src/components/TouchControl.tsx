"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Backdrop } from "@/components/StandBy";
import { TopBar } from "@/components/TopBar";
import { ActivityPills } from "@/components/ActivityPills";
import { FitText } from "@/components/FitText";
import { controlSpotify, useEstimatedProgress, useNowPlaying } from "@/lib/spotifyClient";
import { useArtTheme, NEUTRAL_ACCENT } from "@/lib/useArtTheme";
import { pollEvery } from "@/lib/poll";
import type { HomeEntity, HomeSnapshot, HomeAction } from "@/lib/smarthome/types";

const W = 1440;
const H = 900;
const PIN_KEY = "hb-control-pin";

// ---------- data ----------

type Gate = null | "needs_pin" | "bad_pin" | "pin_not_configured";

function useHome(pin: string | null) {
  const [snap, setSnap] = useState<HomeSnapshot | null>(null);
  const [gate, setGate] = useState<Gate>(null);
  const [error, setError] = useState<string | null>(null);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/home", { cache: "no-store", headers: { "x-control-pin": pinRef.current ?? "" } });
      const j = await res.json();
      if (res.ok) {
        setSnap(j);
        setGate(null);
        setError(null);
      } else if (j.error === "needs_pin" || j.error === "bad_pin" || j.error === "pin_not_configured") {
        setGate(j.error);
      } else {
        setError(j.detail ?? j.error ?? "Couldn't reach your home");
      }
    } catch {
      setError("Couldn't reach the dashboard");
    }
  }, []);

  useEffect(() => {
    load();
    return pollEvery(load, 20_000);
  }, [load, pin]);

  /** Apply the change locally first (feels instant on a touch screen), send it, then re-sync. */
  const act = useCallback(
    async (id: string, action: HomeAction) => {
      setSnap((s) => (s ? { ...s, entities: s.entities.map((e) => (e.id === id ? applyLocal(e, action) : e)) } : s));
      try {
        await fetch("/api/home/action", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-control-pin": pinRef.current ?? "" },
          body: JSON.stringify({ id, action }),
        });
      } catch {
        // re-sync below shows the truth
      }
      setTimeout(load, 900);
    },
    [load]
  );

  return { snap, gate, error, act, load };
}

function applyLocal(e: HomeEntity, a: HomeAction): HomeEntity {
  switch (a.type) {
    case "toggle": return { ...e, on: !e.on };
    case "on": return { ...e, on: true };
    case "off": return { ...e, on: false };
    case "brightness": return { ...e, on: true, brightness: a.value };
    case "volume": return { ...e, volume: a.value };
    case "play": return { ...e, playing: true, on: true };
    case "pause": return { ...e, playing: false };
    default: return e;
  }
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

// ---------- primitives ----------

/** Big, finger-sized slider: drag anywhere on the track; commits on release. */
function Slider({ value, onChange, onCommit, accent, height = 44, disabled }: {
  value: number; onChange: (v: number) => void; onCommit: (v: number) => void; accent: string; height?: number; disabled?: boolean;
}) {
  const drag = useRef(false);
  const last = useRef(value);
  const set = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const v = Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100)));
    last.current = v;
    onChange(v);
  };
  return (
    <div
      className="relative rounded-full overflow-hidden touch-none select-none"
      style={{ height, background: "rgba(255,255,255,0.14)", opacity: disabled ? 0.4 : 1 }}
      onPointerDown={(e) => { if (disabled) return; drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); set(e); }}
      onPointerMove={(e) => { if (drag.current) set(e); }}
      onPointerUp={(e) => { if (!drag.current) return; drag.current = false; set(e); onCommit(last.current); }}
    >
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${accent}a6, ${accent})` }} />
    </div>
  );
}

const Bulb = ({ on }: { on: boolean }) => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill={on ? "#ffd27a" : "none"} stroke={on ? "#ffd27a" : "rgba(255,255,255,0.7)"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
  </svg>
);
const Sparkle = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
  </svg>
);
const Icon = ({ d, size = 34 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d={d} /></svg>
);
const PREV = "M6 6h2v12H6zM9.5 12 18 6v12z";
const NEXT = "M16 6h2v12h-2zM6 18V6l8.5 6z";
const PLAY = "M8 5v14l11-7z";
const PAUSE = "M7 5h4v14H7zM13 5h4v14h-4z";

function Press({ children, onClick, className = "", style }: { children: React.ReactNode; onClick: () => void; className?: string; style?: React.CSSProperties }) {
  return (
    <button onClick={onClick} className={`touch-manipulation active:scale-[0.96] transition-transform duration-150 ${className}`} style={style}>
      {children}
    </button>
  );
}

// ---------- pieces ----------

function SceneButton({ e, act, accent }: { e: HomeEntity; act: (id: string, a: HomeAction) => void; accent: string }) {
  const [fired, setFired] = useState(false);
  return (
    <Press
      onClick={() => { act(e.id, { type: "activate" }); setFired(true); setTimeout(() => setFired(false), 900); }}
      className="glass-card flex items-center gap-4 px-6 shrink-0"
      style={{ height: 92, minWidth: 210, borderRadius: 30, boxShadow: fired ? `0 0 0 2px ${accent}, 0 0 30px ${accent}66` : undefined, transition: "box-shadow 0.4s" }}
    >
      <Sparkle />
      <span className="text-white font-bold" style={{ fontSize: 22 }}>{e.name}</span>
    </Press>
  );
}

function LightTile({ e, act, accent }: { e: HomeEntity; act: (id: string, a: HomeAction) => void; accent: string }) {
  const [live, setLive] = useState<number | null>(null);
  const level = live ?? e.brightness ?? (e.on ? 100 : 0);
  const on = Boolean(e.on);
  return (
    <div
      className="glass-card flex flex-col justify-between"
      style={{
        width: 200, height: 168, borderRadius: 34, padding: 18, opacity: e.available ? 1 : 0.4,
        background: on
          ? "radial-gradient(120% 120% at 20% 0%, rgba(255,200,110,0.30), transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.07))"
          : undefined,
      }}
    >
      <Press onClick={() => act(e.id, { type: "toggle" })} className="text-left flex-1 flex flex-col justify-between">
        <Bulb on={on} />
        <div>
          <FitText className="text-white font-bold" style={{ fontSize: 20 }}>{e.name}</FitText>
          <div className="num-rounded font-semibold text-white/55" style={{ fontSize: 15 }}>{on ? (e.dimmable ? `On · ${level}%` : "On") : "Off"}</div>
        </div>
      </Press>
      {e.dimmable && (
        <div className="mt-2">
          <Slider value={on ? level : 0} onChange={setLive} onCommit={(v) => { setLive(null); act(e.id, v <= 0 ? { type: "off" } : { type: "brightness", value: v }); }} accent={accent} height={30} />
        </div>
      )}
    </div>
  );
}

function SwitchTile({ e, act }: { e: HomeEntity; act: (id: string, a: HomeAction) => void }) {
  const on = Boolean(e.on);
  return (
    <Press
      onClick={() => act(e.id, { type: "toggle" })}
      className="glass-card flex flex-col justify-between text-left"
      style={{ width: 200, height: 168, borderRadius: 34, padding: 18, opacity: e.available ? 1 : 0.4 }}
    >
      <Bulb on={on} />
      <div>
        <FitText className="text-white font-bold" style={{ fontSize: 20 }}>{e.name}</FitText>
        <div className="font-semibold text-white/55" style={{ fontSize: 15 }}>{on ? "On" : "Off"}</div>
      </div>
    </Press>
  );
}

function MusicCard({ accent }: { accent: string }) {
  const np = useNowPlaying();
  const track = np?.track ?? null;
  const progress = useEstimatedProgress(track, np?.isPlaying ?? false, np?.fetchedAt);
  const [vol, setVol] = useState<number | null>(null);
  const shown = vol ?? np?.volumePercent ?? 50;
  const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

  if (!np?.connected || !track) {
    return (
      <div className="glass-card flex items-center justify-center text-center px-8" style={{ height: 150, borderRadius: 40 }}>
        <div className="text-white/45 font-semibold" style={{ fontSize: 20 }}>{np?.connected ? "Nothing playing — start Spotify on any device" : "Spotify isn't connected"}</div>
      </div>
    );
  }
  return (
    <div className="glass-card flex flex-col gap-4" style={{ borderRadius: 44, padding: 28 }}>
      <div className="flex gap-5">
        {track.albumArtUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external Spotify CDN image
          <img src={track.albumArtUrl} alt="" className="object-cover shrink-0" style={{ width: 150, height: 150, borderRadius: 36, boxShadow: `0 10px 36px ${accent}70` }} />
        )}
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <FitText lines={2} className="text-white font-bold leading-tight" style={{ fontSize: 28 }}>{track.name}</FitText>
          <FitText className="text-white/60 font-medium" style={{ fontSize: 19 }}>{track.artists}</FitText>
        </div>
      </div>
      <div>
        <div className="rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.18)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (progress / track.durationMs) * 100)}%`, background: `linear-gradient(90deg, ${accent}a6, ${accent})` }} />
        </div>
        <div className="flex justify-between num-rounded font-semibold text-white/45 mt-1.5" style={{ fontSize: 14 }}><span>{fmt(progress)}</span><span>{fmt(track.durationMs)}</span></div>
      </div>
      <div className="flex items-center justify-center gap-10 text-white">
        <Press onClick={() => controlSpotify("previous")} className="p-3"><Icon d={PREV} size={44} /></Press>
        <Press onClick={() => controlSpotify(np.isPlaying ? "pause" : "play")} className="glass-card flex items-center justify-center" style={{ width: 84, height: 84, borderRadius: 42 }}>
          <Icon d={np.isPlaying ? PAUSE : PLAY} size={42} />
        </Press>
        <Press onClick={() => controlSpotify("next")} className="p-3"><Icon d={NEXT} size={44} /></Press>
      </div>
      <Slider value={shown} onChange={setVol} onCommit={(v) => { controlSpotify("volume", v); setTimeout(() => setVol(null), 1500); }} accent={accent} height={40} />
    </div>
  );
}

function MediaRow({ e, act, accent }: { e: HomeEntity; act: (id: string, a: HomeAction) => void; accent: string }) {
  const [live, setLive] = useState<number | null>(null);
  const vol = live ?? e.volume ?? 0;
  return (
    <div className="glass-card flex flex-col gap-3" style={{ borderRadius: 32, padding: "16px 20px", opacity: e.available ? 1 : 0.4 }}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <FitText className="text-white font-bold" style={{ fontSize: 19 }}>{e.name}</FitText>
          <div className="text-white/50 font-semibold truncate" style={{ fontSize: 14 }}>{e.title ?? (e.playing ? "Playing" : e.on ? "Idle" : "Off")}</div>
        </div>
        <Press onClick={() => act(e.id, { type: "previous" })} className="p-2 text-white/80"><Icon d={PREV} size={28} /></Press>
        <Press onClick={() => act(e.id, { type: e.playing ? "pause" : "play" })} className="glass-card flex items-center justify-center text-white" style={{ width: 56, height: 56, borderRadius: 28 }}>
          <Icon d={e.playing ? PAUSE : PLAY} size={26} />
        </Press>
        <Press onClick={() => act(e.id, { type: "next" })} className="p-2 text-white/80"><Icon d={NEXT} size={28} /></Press>
      </div>
      {e.volume != null && <Slider value={vol} onChange={setLive} onCommit={(v) => { setLive(null); act(e.id, { type: "volume", value: v }); }} accent={accent} height={30} />}
    </div>
  );
}

function PinPad({ gate, onSubmit }: { gate: Gate; onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];
  if (gate === "pin_not_configured") {
    return (
      <div className="glass-card text-center" style={{ width: 560, padding: 40, borderRadius: 44 }}>
        <div className="text-white font-bold mb-3" style={{ fontSize: 28 }}>Set a control PIN first</div>
        <div className="text-white/60 font-medium" style={{ fontSize: 18 }}>
          Add a CONTROL_PIN environment variable in Vercel. Real devices stay locked until there is one, because this app has no login.
        </div>
      </div>
    );
  }
  return (
    <div className="glass-card flex flex-col items-center" style={{ width: 420, padding: 36, borderRadius: 48 }}>
      <div className="caps-label mb-4" style={{ fontSize: 14 }}>{gate === "bad_pin" ? "Wrong PIN — try again" : "Enter PIN"}</div>
      <div className="flex gap-3 mb-6 h-5">{pin.split("").map((_, i) => <span key={i} className="w-4 h-4 rounded-full bg-white" />)}</div>
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => (
          <Press
            key={k}
            onClick={() => { if (k === "⌫") setPin((p) => p.slice(0, -1)); else if (k === "OK") { if (pin) onSubmit(pin); } else setPin((p) => (p + k).slice(0, 12)); }}
            className="glass-card num-rounded font-bold text-white flex items-center justify-center"
            style={{ width: 100, height: 76, borderRadius: 28, fontSize: 28 }}
          >
            {k}
          </Press>
        ))}
      </div>
    </div>
  );
}

// ---------- screen ----------

export function TouchControl() {
  const scale = useScale();
  const np = useNowPlaying();
  const playing = Boolean(np?.connected && np.isPlaying && np.track);
  const { backdrop, accent } = useArtTheme(playing ? np?.track?.albumArtUrl : null);
  const color = playing ? accent : NEUTRAL_ACCENT;

  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => {
    try { setPin(localStorage.getItem(PIN_KEY)); } catch { /* private mode */ }
  }, []);
  const { snap, gate, error, act } = useHome(pin);

  // Set after mount: rendering the time on the server would mismatch the client on hydration.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const submitPin = (p: string) => {
    try { localStorage.setItem(PIN_KEY, p); } catch { /* ignore */ }
    setPin(p);
  };

  const entities = snap?.entities ?? [];
  const scenes = entities.filter((e) => e.kind === "scene");
  const media = entities.filter((e) => e.kind === "media");
  const devices = entities.filter((e) => e.kind === "light" || e.kind === "switch");
  const rooms = [...new Set(devices.map((d) => d.room))];
  const time = now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

  return (
    <div className="fixed inset-0 bg-black overflow-hidden text-white" style={{ ["--accent" as string]: color }}>
      <Backdrop art={backdrop} playing={playing} accent={color} />
      <div className="absolute" style={{ left: "50%", top: "50%", width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {gate ? (
          <div className="absolute inset-0 flex items-center justify-center"><PinPad gate={gate} onSubmit={submitPin} /></div>
        ) : (
          <>
            {/* left: scenes + lights */}
            <div className="absolute flex flex-col" style={{ left: 50, top: 84, width: 840, height: 790 }}>
              <div className="flex items-end justify-between mb-5">
                <div className="num-rounded text-gradient-white font-semibold" style={{ fontSize: 76, lineHeight: 1 }}>{time}</div>
                {snap?.provider === "demo" && (
                  <div className="glass-card px-5 py-2 text-white/60 font-semibold" style={{ borderRadius: 24, fontSize: 14 }}>
                    Demo devices — connect Home Assistant in Control
                  </div>
                )}
              </div>
              {error && !snap && <div className="glass-card px-6 py-4 text-white/70 font-semibold" style={{ borderRadius: 28, fontSize: 18 }}>{error}</div>}

              {scenes.length > 0 && (
                <div className="mb-6">
                  <div className="caps-label mb-3" style={{ fontSize: 13 }}>Scenes</div>
                  <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                    {scenes.map((s) => <SceneButton key={s.id} e={s} act={act} accent={color} />)}
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto pr-2" style={{ scrollbarWidth: "none", maskImage: "linear-gradient(180deg, #000 92%, transparent)" }}>
                <div className="flex flex-wrap items-start gap-x-10 gap-y-6">
                {rooms.map((room) => (
                  <div key={room}>
                    <div className="caps-label mb-3" style={{ fontSize: 13 }}>{room}</div>
                    <div className="flex flex-wrap gap-3" style={{ maxWidth: 2 * 212 }}>
                      {devices.filter((d) => d.room === room).map((d) => (d.kind === "light" ? <LightTile key={d.id} e={d} act={act} accent={color} /> : <SwitchTile key={d.id} e={d} act={act} />))}
                    </div>
                  </div>
                ))}
                </div>
                {snap && devices.length === 0 && <div className="text-white/45 font-semibold" style={{ fontSize: 20 }}>No lights or switches found.</div>}
              </div>
            </div>

            {/* right: music + speakers */}
            <div className="absolute flex flex-col gap-4 overflow-y-auto" style={{ left: 930, top: 96, width: 460, height: 780, scrollbarWidth: "none" }}>
              <MusicCard accent={color} />
              {media.length > 0 && <div className="caps-label mt-1" style={{ fontSize: 13, paddingLeft: 8 }}>Speakers & TVs</div>}
              {media.map((m) => <MediaRow key={m.id} e={m} act={act} accent={color} />)}
            </div>
          </>
        )}
      </div>
      <TopBar />
      <ActivityPills includeMusic={false} hide={["game"]} />
    </div>
  );
}
