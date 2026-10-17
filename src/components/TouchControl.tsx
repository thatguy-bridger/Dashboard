"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Backdrop } from "@/components/StandBy";
import { TopBar } from "@/components/TopBar";
import { ActivityPills } from "@/components/ActivityPills";
import { FitText } from "@/components/FitText";
import { controlSpotify, pollOnce, setNowPlayingDimmed, useEstimatedProgress, useNowPlaying, useStickyPlaying } from "@/lib/spotifyClient";
import { useArtTheme, NEUTRAL_ACCENT } from "@/lib/useArtTheme";
import { pollEvery } from "@/lib/poll";
import { useAutoUpdate } from "@/lib/useAutoUpdate";
import { OFF_COLOR, lightColor } from "@/lib/lightColor";
import type { DeviceTimer, HomeEntity, HomeSnapshot, HomeAction } from "@/lib/smarthome/types";

/** Any CSS colour at a given opacity (appending hex alpha to hsl()/rgb() strings is invalid CSS and silently drops the whole gradient). */
const withAlpha = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

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
  /** Entities with a change in flight: keep the tapped state on screen until the device reports it
   *  (cloud bulbs take a few seconds), instead of snapping back to the stale value and inviting a second tap. */
  const pending = useRef(new Map<string, { until: number; to: HomeEntity }>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  /** ids still waiting for their device to confirm (drives the little "syncing" pulse) */
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const markSyncing = () => setSyncing(new Set(pending.current.keys()));

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/home", { cache: "no-store", headers: { "x-control-pin": pinRef.current ?? "" } });
      const j = await res.json();
      if (res.ok) {
        const now = Date.now();
        const merged = (j as HomeSnapshot).entities.map((e) => {
          const p = pending.current.get(e.id);
          if (!p) return e;
          if (now > p.until || matches(e, p.to)) {
            pending.current.delete(e.id);
            return e;
          }
          return p.to; // device hasn't caught up yet
        });
        setSnap({ ...(j as HomeSnapshot), entities: merged });
        markSyncing();
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
    (target: string | string[], action: HomeAction) => {
      const ids = Array.isArray(target) ? target : [target];
      setSnap((s) => {
        if (!s) return s;
        const entities = s.entities.map((e) => {
          if (!ids.includes(e.id)) return e;
          const to = applyLocal(e, action);
          if (action.type !== "activate") pending.current.set(e.id, { until: Date.now() + 9000, to });
          return to;
        });
        return { ...s, entities };
      });
      markSyncing();
      // Commands go out one at a time, in the order they were tapped.
      queue.current = queue.current.then(async () => {
        try {
          await fetch("/api/home/action", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-control-pin": pinRef.current ?? "" },
            body: JSON.stringify({ ids, action }),
          });
        } catch {
          // the confirm loop / next refresh shows the truth
        }
      });
      // Then watch just these devices until they report the change (cloud bulbs take a second or two),
      // and settle the screen the moment they do. Doesn't block later taps.
      if (action.type !== "activate") {
        queue.current.then(() => confirm(ids));
      } else {
        setTimeout(load, 2000);
        setTimeout(load, 5000);
      }
      setTimeout(load, 10_000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- confirm is defined below and only uses refs/stable setters
    [load]
  );

  async function confirm(ids: string[]) {
    for (let i = 0; i < 9; i++) {
      await new Promise((r) => setTimeout(r, 700));
      const open = ids.filter((id) => pending.current.has(id));
      if (open.length === 0) break;
      try {
        const res = await fetch(`/api/home/state?ids=${encodeURIComponent(open.join(","))}`, { cache: "no-store", headers: { "x-control-pin": pinRef.current ?? "" } });
        if (!res.ok) continue;
        const { entities } = (await res.json()) as { entities: HomeEntity[] };
        const settled = new Map<string, HomeEntity>();
        for (const e of entities) {
          const p = pending.current.get(e.id);
          if (p && matches(e, p.to)) {
            pending.current.delete(e.id);
            settled.set(e.id, e);
          }
        }
        if (settled.size) {
          // take the device's reported values, keep our names/rooms
          setSnap((s) => (s ? { ...s, entities: s.entities.map((x) => (settled.has(x.id) ? { ...x, ...settled.get(x.id)!, name: x.name, room: x.room } : x)) } : s));
          markSyncing();
        }
      } catch {
        // try again
      }
    }
  }

  /** Remember the lights as they are now under a name (stored on the server). */
  const saveScene = useCallback(
    async (name: string) => {
      await fetch("/api/home/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-control-pin": pinRef.current ?? "" },
        body: JSON.stringify({ name }),
      });
      load();
    },
    [load]
  );

  /** "Turn off (or on) in N minutes": counted by the home system, so it still fires if this screen is off. */
  const setTimer = useCallback(async (id: string, minutes: number, action: "on" | "off") => {
    setSnap((s) => (s ? { ...s, timers: { ...(s.timers ?? {}), [id]: { endsAt: Date.now() + minutes * 60_000, action } } } : s));
    try {
      await fetch("/api/home/timer", { method: "POST", headers: { "Content-Type": "application/json", "x-control-pin": pinRef.current ?? "" }, body: JSON.stringify({ id, minutes, action }) });
    } catch { /* the next refresh shows the truth */ }
  }, []);
  const cancelTimer = useCallback(async (id: string) => {
    setSnap((s) => { if (!s?.timers) return s; const t = { ...s.timers }; delete t[id]; return { ...s, timers: t }; });
    try {
      await fetch("/api/home/timer", { method: "POST", headers: { "Content-Type": "application/json", "x-control-pin": pinRef.current ?? "" }, body: JSON.stringify({ id, cancel: true }) });
    } catch { /* the next refresh shows the truth */ }
  }, []);

  /** Different colours on several lights at once (the album-art lights). */
  const colorMany = useCallback((items: { id: string; h: number; s: number }[]) => {
    const ids = items.map((i) => i.id);
    setSnap((s) => {
      if (!s) return s;
      return { ...s, entities: s.entities.map((e) => {
        const it = items.find((i) => i.id === e.id);
        if (!it) return e;
        const to = applyLocal(e, { type: "color", h: it.h, s: it.s });
        pending.current.set(e.id, { until: Date.now() + 9000, to });
        return to;
      }) };
    });
    markSyncing();
    queue.current = queue.current.then(async () => {
      try {
        await fetch("/api/home/colors", { method: "POST", headers: { "Content-Type": "application/json", "x-control-pin": pinRef.current ?? "" }, body: JSON.stringify({ colors: items }) });
      } catch { /* the confirm loop shows the truth */ }
    });
    queue.current.then(() => confirm(ids));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- confirm is declared below and only uses refs/stable setters
  }, []);

  /** "It's the night": everything off with no exemptions and speakers to the night volume (the server does it all at once). */
  const goNight = useCallback(async (speakerIds: string[]) => {
    setSnap((s) => (s ? { ...s, entities: s.entities.map((e) => (e.kind === "light" || e.kind === "switch" ? { ...e, on: false } : e)) } : s));
    try {
      await fetch("/api/home/night", { method: "POST", headers: { "Content-Type": "application/json", "x-control-pin": pinRef.current ?? "" }, body: JSON.stringify({ run: true, speakers: speakerIds }) });
    } catch { /* the reload shows the truth */ }
    setTimeout(load, 1500);
    setTimeout(load, 5000);
  }, [load]);

  /** Flag a light so the big "All lights" off leaves it alone. */
  const setKeep = useCallback(async (id: string, keep: boolean) => {
    setSnap((s) => (s ? { ...s, keepOn: keep ? [...new Set([...(s.keepOn ?? []), id])] : (s.keepOn ?? []).filter((x) => x !== id) } : s));
    try {
      await fetch("/api/home/keep", { method: "POST", headers: { "Content-Type": "application/json", "x-control-pin": pinRef.current ?? "" }, body: JSON.stringify({ id, keep }) });
    } catch { /* the next refresh shows the truth */ }
  }, []);

  /** "I'm leaving" / "I'm back": the server remembers what was on and restores it. */
  const setAway = useCallback(
    async (mode: "leave" | "return") => {
      setSnap((s) => {
        if (!s) return s;
        const entities = mode === "leave" ? s.entities.map((e) => (e.kind === "light" || e.kind === "switch" ? { ...e, on: false } : e)) : s.entities;
        return { ...s, entities, away: mode === "leave" };
      });
      // hold the optimistic state; the reload below replaces it with the truth
      try {
        await fetch("/api/home/away", { method: "POST", headers: { "Content-Type": "application/json", "x-control-pin": pinRef.current ?? "" }, body: JSON.stringify({ mode }) });
      } catch { /* the reload shows the truth */ }
      setTimeout(load, 1500);
      setTimeout(load, 5000);
    },
    [load]
  );

  return { snap, gate, error, act, load, saveScene, syncing, setAway, setKeep, goNight, colorMany, setTimer, cancelTimer };
}

/** Has the device caught up with what we asked for? */
function matches(server: HomeEntity, want: HomeEntity): boolean {
  if (Boolean(server.on) !== Boolean(want.on) && want.kind !== "media") return false;
  if (want.brightness != null && server.brightness != null && Math.abs(server.brightness - want.brightness) > 4) return false;
  if (want.colorTemp && server.colorTemp && Math.abs(server.colorTemp - want.colorTemp) > 150) return false;
  if (want.volume != null && server.volume != null && Math.abs(server.volume - want.volume) > 3) return false;
  if (want.kind === "fan" && want.speed != null && server.speed != null && Math.abs(server.speed - want.speed) > 8) return false;
  if (want.kind === "media" && Boolean(server.playing) !== Boolean(want.playing)) return false;
  return true;
}

function applyLocal(e: HomeEntity, a: HomeAction): HomeEntity {
  switch (a.type) {
    case "toggle": return { ...e, on: !e.on };
    case "on": return { ...e, on: true };
    case "off": return { ...e, on: false };
    case "brightness": return { ...e, on: true, brightness: a.value };
    case "volume": return { ...e, volume: a.value };
    case "speed": return { ...e, on: a.value > 0, speed: a.value };
    case "colorTemp": return { ...e, on: true, colorTemp: a.value, hs: undefined };
    case "color": return { ...e, on: true, hs: [a.h, a.s] as [number, number] };
    case "play": return { ...e, playing: true, on: true };
    case "pause": return { ...e, playing: false };
    default: return e;
  }
}

/** How dark the screen should be, 0 (awake) to 1 (black), from how long nobody has touched it or moved in front of it.
 *  With a presence sensor: nothing for 5s starts a slow fade that reaches black at 20s. Without one: the old 2 minutes of no touches.
 *  Any touch or movement snaps straight back to awake. */
function useDimmer(presence: React.MutableRefObject<boolean>) {
  const [level, setLevel] = useState(0);
  const last = useRef(0);
  const forced = useRef(false);
  const api = useRef<{ activity: () => void; sleep: () => void }>({ activity() {}, sleep() {} });
  useEffect(() => {
    last.current = Date.now();
    const compute = () => {
      if (forced.current) return 1;
      const t = (Date.now() - last.current) / 1000;
      const [start, ramp] = presence.current ? [5, 15] : [120, 15];
      return t < start ? 0 : Math.min(1, (t - start) / ramp);
    };
    const tick = () => setLevel((cur) => { const n = Math.round(compute() * 50) / 50; return n === cur ? cur : n; });
    const activity = () => { last.current = Date.now(); forced.current = false; setLevel(0); };
    api.current = { activity, sleep() { forced.current = true; setLevel(1); } };
    window.addEventListener("pointerdown", activity, true);
    window.addEventListener("pointermove", activity, true);
    const id = setInterval(tick, 250);
    return () => { clearInterval(id); window.removeEventListener("pointerdown", activity, true); window.removeEventListener("pointermove", activity, true); };
  }, [presence]);
  return { level, idle: level >= 1, activity: () => api.current.activity(), sleep: () => api.current.sleep() };
}

/** Fully Kiosk Browser's JavaScript interface (Fire/Android kiosk tablets). Needs "JavaScript Interface (PLUS)" on. */
interface FullyApi {
  bind?: (event: string, js: string) => void;
  startMotionDetection?: () => void;
  stopMotionDetection?: () => void;
  setScreenBrightness?: (v: number) => void;
  getScreenBrightness?: () => number;
}
const getFully = (): FullyApi | null => (typeof window !== "undefined" ? ((window as unknown as { fully?: FullyApi }).fully ?? null) : null);

/** Polls Home Assistant for motion sensors (e.g. this tablet's camera via the IP Webcam app) while `enabled`.
 *  Calls onMotion on a fresh trigger. Returns how many motion sensors exist (0 = none set up). */
function useHaMotion(pin: string | null, enabled: boolean, onMotion: () => void): number {
  const [sensors, setSensors] = useState(0);
  const cb = useRef(onMotion);
  useEffect(() => { cb.current = onMotion; });
  useEffect(() => {
    if (!pin) return;
    let stopped = false;
    let seen = Date.now(); // only triggers newer than "now" count
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();
    const run = async () => {
      if (stopped) return;
      try {
        // While waiting on motion the server holds this request open and answers the moment a sensor fires;
        // otherwise it's just a slow check that a sensor exists.
        const res = await fetch(`/api/home/motion${enabled ? `?wait=1&since=${seen}` : ""}`, { cache: "no-store", headers: { "x-control-pin": pin }, signal: ctrl.signal });
        if (stopped) return;
        if (res.ok) {
          const m = (await res.json()) as { sensors: number; active: boolean; since: number };
          setSensors(m.sensors);
          if (enabled && m.active && m.since > seen) { seen = m.since; cb.current(); }
          timer = setTimeout(run, enabled ? (m.sensors ? 0 : 5000) : 60_000);
          return;
        }
      } catch { /* aborted or offline */ }
      if (!stopped) timer = setTimeout(run, enabled ? 3000 : 60_000);
    };
    run();
    return () => { stopped = true; ctrl.abort(); if (timer) clearTimeout(timer); };
  }, [pin, enabled]);
  return sensors;
}

const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const MP_VERSION = "1.1.1";

/** Watches the front camera for a face (on this device only, nothing is uploaded) and calls
 *  onFace when someone stands there. The camera is only on while `enabled`. */
function useApproach(enabled: boolean, onFace: () => void): "off" | "on" | "denied" | "error" {
  const [status, setStatus] = useState<"on" | "denied" | "error">("on");
  const cb = useRef(onFace);
  useEffect(() => { cb.current = onFace; });
  useEffect(() => {
    if (!enabled) return;
    // Inside Fully Kiosk the browser can't prompt for the camera; use Fully's own motion detection instead.
    const fully = getFully();
    if (fully?.startMotionDetection && fully.bind) {
      (window as unknown as { __hbMotion?: () => void }).__hbMotion = () => cb.current();
      fully.bind("onMotion", "window.__hbMotion && window.__hbMotion();");
      fully.startMotionDetection();
      return () => { fully.stopMotionDetection?.(); (window as unknown as { __hbMotion?: () => void }).__hbMotion = undefined; };
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 240 }, audio: false });
      } catch {
        if (!stopped) setStatus("denied");
        return;
      }
      try {
        const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`);
        const detector = await FaceDetector.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: "VIDEO", minDetectionConfidence: 0.6 });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        setStatus("on");
        let hits = 0;
        timer = setInterval(() => {
          if (video.readyState < 2) return;
          const seen = detector.detectForVideo(video, performance.now()).detections.length > 0;
          hits = seen ? hits + 1 : 0;
          if (hits >= 2) { hits = 0; cb.current(); }
        }, 500);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        if (!stopped) setStatus("error");
      }
    })();
    return () => { stopped = true; if (timer) clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [enabled]);
  return enabled ? status : "off";
}

function useScale() {
  const [s, setS] = useState(1);
  useEffect(() => {
    // fill the screen: scale by height, let the canvas width follow the aspect ratio
    const f = () => setS(Math.max(0.5, Math.min(window.innerHeight / H, window.innerWidth / 1100)));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return s;
}

function useCanvasWidth(scale: number) {
  const [w, setW] = useState(W);
  useEffect(() => {
    const f = () => setW(Math.max(1100, Math.round(window.innerWidth / scale)));
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, [scale]);
  return w;
}

// ---------- primitives ----------

/** Big, finger-sized slider: drag anywhere on the track; commits on release. */
function Slider({ value, onChange, onCommit, accent, height = 44, disabled, track }: {
  value: number; onChange: (v: number) => void; onCommit: (v: number) => void; accent: string; height?: number; disabled?: boolean;
  /** a CSS gradient: shows a thumb on that gradient instead of the accent fill (warmth / hue) */
  track?: string;
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
      style={{ height, background: track ?? "rgba(255,255,255,0.14)", opacity: disabled ? 0.4 : 1 }}
      onPointerDown={(e) => { if (disabled) return; drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); set(e); }}
      onPointerMove={(e) => { if (drag.current) set(e); }}
      onPointerUp={(e) => { if (!drag.current) return; drag.current = false; set(e); onCommit(last.current); }}
    >
      {track ? (
        <div className="absolute top-1/2 rounded-full bg-white" style={{ left: `calc(${value}% - ${height * 0.4}px)`, width: height * 0.8, height: height * 0.8, transform: "translateY(-50%)", boxShadow: "0 2px 10px rgba(0,0,0,0.5)" }} />
      ) : (
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${withAlpha(accent, 65)}, ${accent})` }} />
      )}
    </div>
  );
}

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

function SceneButton({ e, act, accent }: { e: HomeEntity; act: (target: string | string[], a: HomeAction) => void; accent: string }) {
  const [fired, setFired] = useState(false);
  return (
    <Press
      onClick={() => { act(e.id, { type: "activate" }); setFired(true); setTimeout(() => setFired(false), 900); }}
      className="glass-card flex items-center gap-4 px-6 shrink-0"
      style={{ height: 92, minWidth: 210, borderRadius: 30, boxShadow: fired ? `0 0 0 2px ${accent}, 0 0 30px ${withAlpha(accent, 40)}` : undefined, transition: "box-shadow 0.4s" }}
    >
      <Sparkle />
      <span className="text-white font-bold" style={{ fontSize: 22 }}>{e.name}</span>
    </Press>
  );
}

// ---------- colour helpers ----------

const fmtTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
/** After 9pm and before 5am (the tablet's local time). */
const isNight = () => { const h = new Date().getHours(); return h >= 21 || h < 5; };
/** How far into the night it is, 0 at 9pm growing to 1 by 1am (the "It's the night" button grows with it). */
const nightDepth = (d: Date) => { const m = ((d.getHours() * 60 + d.getMinutes()) - 21 * 60 + 1440) % 1440; return m > 8 * 60 ? 0 : Math.min(1, m / 240); };

function useNightVolume(pin: string | null) {
  const [volume, setVolume] = useState(20);
  useEffect(() => {
    if (!pin) return;
    fetch("/api/home/night", { cache: "no-store", headers: { "x-control-pin": pin } }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && typeof j.volume === "number") setVolume(j.volume); }).catch(() => {});
  }, [pin]);
  const save = (v: number) => {
    setVolume(v);
    fetch("/api/home/night", { method: "POST", headers: { "Content-Type": "application/json", "x-control-pin": pin ?? "" }, body: JSON.stringify({ volume: v }) }).catch(() => {});
  };
  return { volume, save };
}
const hexToHs = (hex: string): [number, number] => {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round((h * 60 + 360) % 360), Math.round(max === 0 ? 0 : (d / max) * 100)];
};

/** Which lights follow the music, saved on this tablet. */
interface MusicLightsCfg { enabled: boolean; ids: string[]; restore: Record<string, { on: boolean; brightness?: number; colorTemp?: number; hs?: [number, number] }> }
const ML_KEY = "hb-music-lights";
const readMusicLights = (): MusicLightsCfg => {
  try { const v = JSON.parse(localStorage.getItem(ML_KEY) ?? "null"); if (v) return { enabled: Boolean(v.enabled), ids: Array.isArray(v.ids) ? v.ids : [], restore: v.restore ?? {} }; } catch { /* none saved */ }
  return { enabled: false, ids: [], restore: {} };
};

const normName = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, "");
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/** A bulb split into one coloured stripe per light, glowing in the colour they are showing. */
function SegmentBulb({ lights, size = 44, selected, onPick }: { lights: HomeEntity[]; size?: number; selected?: string | null; onPick?: (id: string) => void }) {
  const uid = useId().replace(/:/g, "");
  const n = Math.max(1, lights.length);
  const x0 = 5.2, w = 13.6 / n;
  const lit = lights.filter((l) => l.on);
  const glow = lit[0] ? lightColor(lit[0]) : null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible", filter: glow ? `drop-shadow(0 0 ${size / 5}px ${glow})` : undefined, transition: "filter 0.3s" }}>
      <defs><clipPath id={uid}><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></clipPath></defs>
      <g clipPath={`url(#${uid})`}>
        {lights.map((l, i) => (
          <rect key={l.id} x={x0 + i * w} y={2} width={w + 0.05} height={15} fill={lightColor(l)} onClick={onPick ? () => onPick(l.id) : undefined} style={{ cursor: onPick ? "pointer" : undefined, transition: "fill 0.3s" }} />
        ))}
        {lights.length === 0 && <rect x={x0} y={2} width={13.6} height={15} fill={OFF_COLOR} />}
      </g>
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" fill="none" stroke={lit.length ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)"} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.5 19h5M10.5 21.5h3" stroke="rgba(255,255,255,0.7)" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      {selected && lights.map((l, i) => l.id === selected && <rect key={l.id} x={x0 + i * w} y={2} width={w} height={15} fill="none" stroke="#fff" strokeWidth="0.8" clipPath={`url(#${uid})`} />)}
    </svg>
  );
}

/** iOS-style switch: one control for on and off. */
function Toggle({ on, onChange, size = 1 }: { on: boolean; onChange: (next: boolean) => void; size?: number }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={(ev) => { ev.stopPropagation(); onChange(!on); }}
      className="relative shrink-0 touch-manipulation rounded-full"
      style={{ width: 84 * size, height: 48 * size, background: on ? "var(--accent, #ffd27a)" : "rgba(255,255,255,0.18)", transition: "background 0.2s" }}
    >
      <span className="absolute rounded-full bg-white" style={{ top: 4 * size, left: (on ? 40 : 4) * size, width: 40 * size, height: 40 * size, transition: "left 0.2s", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }} />
    </button>
  );
}

/** A modal that scrolls when it has more to show. */
function Sheet({ title, onClose, children, width = 720, glow }: { title: string; onClose: () => void; children: React.ReactNode; width?: number; glow?: string }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75" onClick={onClose}>
      <div
        className="glass-card flex flex-col overflow-hidden"
        style={{ width, maxHeight: 840, borderRadius: 48, background: `${glow ? `radial-gradient(90% 40% at 50% 0%, ${withAlpha(glow, 33)}, transparent 70%), ` : ""}rgba(14,14,18,0.97)` }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0" style={{ padding: "28px 36px 16px" }}>
          <div className="text-white font-bold" style={{ fontSize: 30 }}>{title}</div>
          <Press onClick={onClose} className="glass-card px-6 py-3 text-white font-semibold" style={{ borderRadius: 24, fontSize: 18 }}>Done</Press>
        </div>
        <div className="overflow-y-auto flex flex-col gap-6" style={{ padding: "8px 36px 36px", scrollbarWidth: "none" }}>{children}</div>
      </div>
    </div>
  );
}

// ---------- lights ----------

const RAINBOW = "linear-gradient(90deg, hsl(0 90% 55%), hsl(45 90% 55%), hsl(90 80% 50%), hsl(150 80% 45%), hsl(200 90% 55%), hsl(260 85% 60%), hsl(310 80% 58%), hsl(360 90% 55%))";
const HUES: { name: string; h: number; s: number }[] = [
  { name: "Red", h: 0, s: 90 }, { name: "Orange", h: 25, s: 90 }, { name: "Yellow", h: 50, s: 85 }, { name: "Green", h: 120, s: 80 },
  { name: "Teal", h: 175, s: 80 }, { name: "Blue", h: 215, s: 85 }, { name: "Purple", h: 270, s: 80 }, { name: "Pink", h: 320, s: 75 },
];

type Act = (target: string | string[], a: HomeAction) => void;

/** Details for one light, a room, or every light: a glowing bulb split per light, then every control. */
function LightsSheet({ title, lights, act, accent, onClose, extras, keepOn = [], onKeep }: { title: string; lights: HomeEntity[]; act: Act; accent: string; onClose: () => void; extras?: React.ReactNode; keepOn?: string[]; onKeep?: (id: string, keep: boolean) => void }) {
  const [sel, setSel] = useState<string | null>(lights.length === 1 ? lights[0].id : null);
  const [bri, setBri] = useState<number | null>(null);
  const [warm, setWarm] = useState<number | null>(null);
  const [hue, setHue] = useState<number | null>(null);
  const [sat, setSat] = useState<number | null>(null);
  const targets = sel ? lights.filter((l) => l.id === sel) : lights;
  const ids = targets.map((t) => t.id);
  const onOnes = targets.filter((t) => t.on);
  const anyOn = onOnes.length > 0;
  const dim = targets.filter((t) => t.dimmable);
  const temp = targets.filter((t) => t.supportsColorTemp);
  const col = targets.filter((t) => t.supportsColor);
  const first = onOnes[0] ?? targets[0];
  const glow = first ? lightColor({ ...first, on: true }) : accent;
  const min = temp[0]?.minKelvin ?? 2000, max = temp[0]?.maxKelvin ?? 6500;
  const kel = temp.find((t) => t.colorTemp)?.colorTemp;
  const warmPos = kel ? Math.round(((kel - min) / (max - min)) * 100) : 40;
  const hs = col.find((t) => t.hs)?.hs;
  const curHue = hue ?? (hs ? Math.round((hs[0] / 360) * 100) : 0);
  const curSat = sat ?? (hs ? hs[1] : 90);
  return (
    <Sheet title={title} onClose={onClose} glow={anyOn ? glow : undefined}>
      <div className="flex flex-col items-center gap-3">
        <SegmentBulb lights={lights} size={190} selected={sel} onPick={(id) => setSel((s) => (s === id ? null : id))} />
        <div className="flex flex-wrap justify-center gap-2">
          {lights.length > 1 && (
            <Press onClick={() => setSel(null)} className="px-4 py-2 font-semibold" style={{ borderRadius: 20, fontSize: 15, background: sel === null ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)", color: sel === null ? "#000" : "#fff" }}>All {lights.length}</Press>
          )}
          {lights.length > 1 && lights.map((l) => (
            <Press key={l.id} onClick={() => setSel(l.id)} className="flex items-center gap-2 px-4 py-2 font-semibold" style={{ borderRadius: 20, fontSize: 15, background: sel === l.id ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)", color: sel === l.id ? "#000" : "#fff" }}>
              <span className="rounded-full" style={{ width: 14, height: 14, background: lightColor(l), boxShadow: l.on ? `0 0 8px ${lightColor(l)}` : undefined }} />{l.name}
            </Press>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between glass-card" style={{ borderRadius: 30, padding: "16px 24px" }}>
        <div className="text-white font-bold" style={{ fontSize: 22 }}>{sel ? targets[0]?.name : lights.length > 1 ? "All lights here" : targets[0]?.name} · {anyOn ? `${onOnes.length} on` : "off"}</div>
        <Toggle on={anyOn} onChange={(v) => act(ids, { type: v ? "on" : "off" })} />
      </div>
      {lights.length === 1 && (
        <div className="glass-card" style={{ borderRadius: 30, padding: "16px 24px" }}><TimerRow e={lights[0]} /></div>
      )}
      {onKeep && lights.length === 1 && (
        <Press onClick={() => onKeep(lights[0].id, !keepOn.includes(lights[0].id))} className="flex items-center justify-between glass-card text-left" style={{ borderRadius: 30, padding: "16px 24px" }}>
          <div>
            <div className="text-white font-bold" style={{ fontSize: 20 }}>Stays on with “All lights” off</div>
            <div className="text-white/55 font-semibold" style={{ fontSize: 14 }}>Only the top-right “Turn off all” button turns this one off.</div>
          </div>
          <Toggle on={keepOn.includes(lights[0].id)} onChange={(v) => onKeep(lights[0].id, v)} />
        </Press>
      )}

      {dim.length > 0 && (
        <div>
          <div className="caps-label mb-2" style={{ fontSize: 13 }}>Brightness · {bri ?? avg(dim.map((d) => d.brightness ?? (d.on ? 100 : 0)))}%</div>
          <Slider value={bri ?? avg(dim.map((d) => (d.on ? d.brightness ?? 100 : 0)))} onChange={setBri} onCommit={(v) => { setBri(null); act(dim.map((d) => d.id), v <= 0 ? { type: "off" } : { type: "brightness", value: v }); }} accent={glow} height={56} />
        </div>
      )}
      {temp.length > 0 && (
        <div>
          <div className="caps-label mb-2" style={{ fontSize: 13 }}>Warmth · warm to cool white</div>
          <Slider value={warm ?? warmPos} onChange={setWarm} onCommit={(v) => { setWarm(null); act(temp.map((d) => d.id), { type: "colorTemp", value: min + ((max - min) * v) / 100 }); }} accent={glow} height={56} track="linear-gradient(90deg, #ffb25e, #ffe2b8 45%, #ffffff 60%, #bcd6ff)" />
        </div>
      )}
      {col.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="caps-label" style={{ fontSize: 13 }}>Color</div>
          <div className="flex flex-wrap gap-3">
            {HUES.map((c) => (
              <Press key={c.name} onClick={() => { setHue(null); setSat(null); act(col.map((d) => d.id), { type: "color", h: c.h, s: c.s }); }} className="rounded-full" style={{ width: 68, height: 68, background: `hsl(${c.h} ${c.s}% 55%)`, boxShadow: hs && Math.abs(hs[0] - c.h) < 12 ? `0 0 0 4px #fff, 0 0 26px hsl(${c.h} ${c.s}% 55%)` : "0 2px 10px rgba(0,0,0,0.4)" }}>
                <span className="sr-only">{c.name}</span>
              </Press>
            ))}
          </div>
          <div>
            <div className="text-white/55 font-semibold mb-2" style={{ fontSize: 14 }}>Shade</div>
            <Slider value={curHue} onChange={setHue} onCommit={(v) => { setHue(null); act(col.map((d) => d.id), { type: "color", h: (v / 100) * 360, s: curSat }); }} accent={glow} height={56} track={RAINBOW} />
          </div>
          <div>
            <div className="text-white/55 font-semibold mb-2" style={{ fontSize: 14 }}>Intensity</div>
            <Slider value={curSat} onChange={setSat} onCommit={(v) => { setSat(null); act(col.map((d) => d.id), { type: "color", h: hs ? hs[0] : (curHue / 100) * 360, s: v }); }} accent={glow} height={56} track={`linear-gradient(90deg, #ffffff, hsl(${Math.round((curHue / 100) * 360)} 100% 50%))`} />
          </div>
        </div>
      )}

      {lights.length > 1 && (
        <div className="flex flex-col gap-3">
          <div className="caps-label" style={{ fontSize: 13 }}>Each light</div>
          {lights.map((l) => (
            <div key={l.id} className="glass-card flex items-center gap-4" style={{ borderRadius: 28, padding: "14px 20px", opacity: l.available ? 1 : 0.4 }}>
              <Press onClick={() => setSel(l.id)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                <SegmentBulb lights={[l]} size={44} />
                <div className="min-w-0">
                  <FitText className="text-white font-bold" style={{ fontSize: 20 }}>{l.name}</FitText>
                  <div className="text-white/55 font-semibold" style={{ fontSize: 14 }}>{l.on ? (l.dimmable ? `On · ${l.brightness ?? 100}%` : "On") : "Off"}</div>
                </div>
              </Press>
              {onKeep && (
                <Press onClick={() => onKeep(l.id, !keepOn.includes(l.id))} className="px-4 py-2 font-semibold shrink-0" style={{ borderRadius: 20, fontSize: 14, background: keepOn.includes(l.id) ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)", color: keepOn.includes(l.id) ? "#000" : "#fff" }}>
                  {keepOn.includes(l.id) ? "Stays on ✓" : "Stays on"}
                </Press>
              )}
              <Toggle on={Boolean(l.on)} onChange={(v) => act(l.id, { type: v ? "on" : "off" })} size={0.85} />
            </div>
          ))}
        </div>
      )}
      {extras}
    </Sheet>
  );
}

/** One big button: tap toggles, press and hold opens the details. */
function ToggleButton({ on, onTap, onLong, children, style, glow }: { on: boolean; onTap: () => void; onLong?: () => void; children: React.ReactNode; style?: React.CSSProperties; glow?: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; start.current = null; };
  return (
    <button
      onPointerDown={(e) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        if (onLong) timer.current = setTimeout(() => { fired.current = true; start.current = null; onLong(); }, 480);
      }}
      onPointerMove={(e) => { if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 12) clear(); }}
      onPointerUp={() => { const wasLong = fired.current; const armed = start.current; clear(); if (!wasLong && armed) onTap(); }}
      onPointerCancel={clear}
      onContextMenu={(e) => e.preventDefault()}
      className="touch-manipulation select-none text-left active:scale-[0.97] transition-transform duration-150"
      style={{
        borderRadius: 40,
        border: "1px solid rgba(255,255,255,0.14)",
        background: on
          ? `radial-gradient(120% 140% at 15% 0%, ${glow ?? "rgba(255,200,110,0.55)"}, rgba(255,255,255,0.10) 75%)`
          : "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04))",
        boxShadow: on && glow ? `0 0 40px -10px ${glow}` : undefined,
        WebkitTouchCallout: "none",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

const groupGlow = (ls: HomeEntity[]) => { const l = ls.find((x) => x.on); return l ? lightColor(l) : undefined; };

function LightTile({ e, act, onOpen, syncing }: { e: HomeEntity; act: Act; onOpen?: () => void; syncing?: boolean }) {
  const on = Boolean(e.on);
  return (
    <ToggleButton on={on} glow={on ? lightColor(e) : undefined} onTap={() => act(e.id, { type: on ? "off" : "on" })} onLong={onOpen} style={{ width: "100%", height: 120, padding: "0 24px", opacity: e.available ? 1 : 0.4, outline: syncing ? "2px solid rgba(255,255,255,0.3)" : undefined }}>
      <div className="flex items-center gap-4">
        <span className={syncing ? "animate-pulse" : ""}><SegmentBulb lights={[e]} size={52} /></span>
        <div className="min-w-0 flex-1">
          <FitText className="text-white font-bold" style={{ fontSize: 22 }}>{e.name}</FitText>
          <div className="num-rounded font-semibold text-white/60" style={{ fontSize: 16 }}>{on ? (e.dimmable ? `${e.brightness ?? 100}%` : "On") : "Off"}<TimerBadge id={e.id} /></div>
        </div>
      </div>
    </ToggleButton>
  );
}

function SwitchTile({ e, act, onOpen }: { e: HomeEntity; act: Act; onOpen?: () => void }) {
  const on = Boolean(e.on);
  return (
    <ToggleButton on={on} onTap={() => act(e.id, { type: on ? "off" : "on" })} onLong={onOpen} style={{ width: "100%", height: 120, padding: "0 24px", opacity: e.available ? 1 : 0.4 }}>
      <div className="flex items-center gap-4">
        <SegmentBulb lights={[e]} size={52} />
        <div className="min-w-0 flex-1">
          <FitText className="text-white font-bold" style={{ fontSize: 22 }}>{e.name}</FitText>
          <div className="font-semibold text-white/60" style={{ fontSize: 16 }}>{on ? "On" : "Off"}<TimerBadge id={e.id} /></div>
        </div>
      </div>
    </ToggleButton>
  );
}

// ---------- timers ----------

const TimerCtx = createContext<{ timers: Record<string, DeviceTimer>; set: (id: string, minutes: number, action: "on" | "off") => void; cancel: (id: string) => void }>({ timers: {}, set: () => {}, cancel: () => {} });

/** The current time as state, refreshed every `ms` while `on` (keeps render pure). */
function useClock(ms: number, on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, on]);
  return now;
}

const fmtCountdown = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

/** " · off in 12m" on a tile while a timer runs. */
function TimerBadge({ id }: { id: string }) {
  const { timers } = useContext(TimerCtx);
  const t = timers[id];
  const now = useClock(15_000, Boolean(t));
  if (!t || t.endsAt <= now) return null;
  return <span> · {t.action} in {Math.max(1, Math.round((t.endsAt - now) / 60_000))}m</span>;
}

/** Turn a device off (or on, if it's off) after a while. Shows the countdown while one is running. */
function TimerRow({ e, compact = false }: { e: HomeEntity; compact?: boolean }) {
  const { timers, set, cancel } = useContext(TimerCtx);
  const t = timers[e.id];
  const now = useClock(1000, Boolean(t));
  const action: "on" | "off" = e.on || (e.kind === "media" && e.playing) ? "off" : "on";
  if (t && t.endsAt > now) {
    return (
      <div className="flex items-center justify-between gap-3" style={{ padding: compact ? "2px 4px" : "4px 2px" }}>
        <span className="text-white/75 font-semibold" style={{ fontSize: compact ? 15 : 17 }}>Turns {t.action} in <span className="num-rounded font-bold text-white">{fmtCountdown(t.endsAt - now)}</span></span>
        <Press onClick={() => cancel(e.id)} className="px-4 py-2 font-semibold text-white" style={{ borderRadius: 18, fontSize: 15, background: "rgba(255,255,255,0.14)" }}>Cancel</Press>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-white/50 font-semibold" style={{ fontSize: compact ? 14 : 15, marginRight: 4 }}>Turn {action} in</span>
      {[15, 30, 60, 120, 240].map((m) => (
        <Press key={m} onClick={() => set(e.id, m, action)} className="px-3 py-2 font-semibold text-white" style={{ borderRadius: 18, fontSize: compact ? 14 : 16, background: "rgba(255,255,255,0.12)" }}>{m < 60 ? `${m}m` : `${m / 60}h`}</Press>
      ))}
    </div>
  );
}

// ---------- fans ----------

/** A fan: one tap on a speed number sets it, Off turns it off. */
function FanCard({ e, act }: { e: HomeEntity; act: Act }) {
  const steps = !e.speedSteps || e.speedSteps > 8 ? 6 : e.speedSteps; // a 1-100 fan still gets six buttons, like the voice routines
  const speed = e.on ? (e.speed ?? 0) : 0;
  const current = speed <= 0 ? 0 : Math.max(1, Math.round((speed / 100) * steps));
  return (
    <div className="glass-card flex flex-col gap-3" style={{ borderRadius: 34, padding: "18px 22px", opacity: e.available ? 1 : 0.4 }}>
      <div className="flex items-baseline justify-between">
        <FitText className="text-white font-bold" style={{ fontSize: 24 }}>{e.name}</FitText>
        <span className="text-white/55 font-semibold shrink-0" style={{ fontSize: 16 }}>{current === 0 ? "Off" : `Speed ${current} of ${steps}`}</span>
      </div>
      <div className="flex gap-2">
        <Press onClick={() => act(e.id, { type: "off" })} className="font-bold" style={{ flex: "0 0 auto", minWidth: 84, height: 72, borderRadius: 24, fontSize: 20, background: current === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)", color: current === 0 ? "#000" : "#fff" }}>Off</Press>
        {Array.from({ length: steps }, (_, i) => i + 1).map((n) => (
          <Press key={n} onClick={() => act(e.id, { type: "speed", value: Math.round((n / steps) * 100) })} className="num-rounded font-bold" style={{ flex: 1, height: 72, borderRadius: 24, fontSize: 26, background: current >= n ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)", color: current >= n ? "#000" : "#fff" }}>{n}</Press>
        ))}
      </div>
      <TimerRow e={e} compact />
    </div>
  );
}

// ---------- music ----------

interface Library {
  playlists: { uri: string; name: string; image: string | null; tracks: number }[];
  devices: { id: string; name: string; active: boolean }[];
  /** every speaker on the network joined to Spotify by name (the hidden view) */
  network: { name: string; deviceId: string | null; entityId: string | null; active: boolean }[];
  defaults: { uri: string | null; name: string | null; deviceId: string | null; deviceName: string | null; entityId: string | null };
}

function useLibrary(pin: string | null) {
  const [lib, setLib] = useState<Library | null>(null);
  const [error, setError] = useState<"reconnect" | "not_connected" | "failed" | null>(null);
  const headers = { "Content-Type": "application/json", "x-control-pin": pin ?? "" };
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/playlists", { cache: "no-store", headers: { "x-control-pin": pin ?? "" } });
      const j = await res.json();
      if (res.ok) { setLib(j as Library); setError(null); }
      else setError(j.error === "reconnect" ? "reconnect" : j.error === "not_connected" ? "not_connected" : "failed");
    } catch { setError("failed"); }
  }, [pin]);
  const saveDefaults = async (patch: Partial<Library["defaults"]>) => {
    setLib((l) => (l ? { ...l, defaults: { ...l.defaults, ...patch } } : l));
    try { await fetch("/api/spotify/playlists", { method: "POST", headers, body: JSON.stringify(patch) }); } catch { /* shown on next load */ }
  };
  /** Start a playlist (the default when no uri). Resolves to an error code or null. */
  const play = async (uri?: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/spotify/play-playlist", { method: "POST", headers, body: JSON.stringify(uri ? { uri } : {}) });
      const j = await res.json().catch(() => ({}));
      setTimeout(pollOnce, 1500);
      setTimeout(pollOnce, 4000);
      return res.ok ? null : (j.error ?? "failed");
    } catch { return "failed"; }
  };
  return { lib, error, load, saveDefaults, play };
}

type MusicApi = ReturnType<typeof useLibrary>;

/** The next two songs in the Spotify queue, refreshed whenever the current song changes. */
function useUpNext(pin: string | null, trackId: string | undefined): { id: string; name: string; artists: string }[] {
  const [next, setNext] = useState<{ id: string; name: string; artists: string }[]>([]);
  useEffect(() => {
    if (!trackId) return;
    let stopped = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/spotify/queue", { cache: "no-store", headers: { "x-control-pin": pin ?? "" } });
        if (res.ok && !stopped) setNext(((await res.json()) as { next: { id: string; name: string; artists: string }[] }).next);
      } catch { /* leave the old list */ }
    }, 800);
    return () => { stopped = true; clearTimeout(t); };
  }, [pin, trackId]);
  return trackId ? next : [];
}

const playError = (code: string | null) =>
  code === "no_device" ? "Couldn't reach that speaker. Press and hold \"Play on\" in Music to pick another." :
  code === "no_default" ? "Pick a default playlist first." :
  code ? "Couldn't start it. Try again." : null;

/** The front-screen music control: big, with a play/pause you can hit without looking. Tap the art or title for the rest. */
function MusicController({ guest, accent, music, onOpen, setMessage, height, pin }: { guest: boolean; accent: string; music: MusicApi; onOpen: () => void; setMessage: (m: string | null) => void; height: number; pin: string | null }) {
  const np = useNowPlaying();
  const track = np?.track ?? null;
  const upNext = useUpNext(pin, track?.id);
  const progress = useEstimatedProgress(track, np?.isPlaying ?? false, np?.fetchedAt);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    if (!music.lib?.defaults.uri) { onOpen(); return; }
    setStarting(true);
    const err = await music.play();
    setMessage(playError(err));
    setTimeout(() => setStarting(false), 3500);
  };

  if (!np?.connected) {
    return <div className="glass-card flex items-center justify-center text-center px-8" style={{ height, borderRadius: 52 }}><div className="text-white/45 font-semibold" style={{ fontSize: 22 }}>Spotify isn&apos;t connected</div></div>;
  }
  if (!track && guest) {
    return (
      <div className="glass-card flex flex-col items-center justify-center gap-4 text-center" style={{ height, borderRadius: 52, padding: 32 }}>
        <div className="text-white/80 font-bold" style={{ fontSize: 30 }}>Guest mode</div>
        <div className="text-white/50 font-semibold" style={{ fontSize: 19 }}>Music can’t be started while the house is in guest mode.</div>
      </div>
    );
  }
  if (!track) {
    return (
      <div className="glass-card flex flex-col items-center justify-center gap-8 text-center" style={{ height, borderRadius: 52, padding: 32 }}>
        <Press onClick={start} className="flex items-center justify-center text-black" style={{ width: 280, height: 280, borderRadius: 140, background: accent, boxShadow: `0 16px 60px ${withAlpha(accent, 50)}` }}>
          {starting ? <span className="animate-pulse font-bold" style={{ fontSize: 28 }}>Starting…</span> : <Icon d={PLAY} size={140} />}
        </Press>
        <div className="min-w-0 max-w-full">
          <div className="text-white font-bold" style={{ fontSize: 34 }}>Start music</div>
          <div className="text-white/55 font-semibold truncate" style={{ fontSize: 19 }}>{music.lib?.defaults.name ?? "No default playlist yet"}</div>
        </div>
        <Press onClick={onOpen} className="glass-card px-8 py-4 text-white font-semibold" style={{ borderRadius: 28, fontSize: 20 }}>Choose a playlist</Press>
      </div>
    );
  }
  return (
    <div className="glass-card flex flex-col items-center gap-5" style={{ height, borderRadius: 52, padding: 28 }}>
      <Press onClick={onOpen} className="flex flex-col items-center gap-4 w-full min-h-0 flex-1">
        {track.albumArtUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external Spotify CDN image
          <img src={track.albumArtUrl} alt="" className="object-cover min-h-0" style={{ width: "min(100%, 340px)", aspectRatio: "1", borderRadius: 40, boxShadow: `0 14px 50px ${withAlpha(accent, 44)}` }} />
        )}
        <div className="w-full min-w-0 text-center">
          <FitText lines={2} className="text-white font-bold leading-tight" style={{ fontSize: 32 }}>{track.name}</FitText>
          <FitText className="text-white/60 font-medium" style={{ fontSize: 20 }}>{track.artists}</FitText>
        </div>
      </Press>
      <div className="w-full shrink-0" style={{ padding: "0 8px" }}>
        <div className="rounded-full overflow-hidden" style={{ height: 8, background: "rgba(255,255,255,0.18)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (progress / track.durationMs) * 100)}%`, background: `linear-gradient(90deg, ${withAlpha(accent, 65)}, ${accent})` }} />
        </div>
        <div className="flex justify-between num-rounded font-semibold text-white/55 mt-1.5" style={{ fontSize: 16 }}>
          <span>{fmtTime(progress)}</span>
          <span>{fmtTime(track.durationMs)}</span>
        </div>
      </div>
      {upNext.length > 0 && (
        <div className="w-full shrink-0" style={{ padding: "0 8px" }}>
          <div className="caps-label mb-1.5" style={{ fontSize: 12 }}>Up next</div>
          {upNext.map((u) => (
            <div key={u.id} className="flex items-baseline gap-2 min-w-0" style={{ lineHeight: 1.5 }}>
              <span className="text-white font-semibold truncate" style={{ fontSize: 18 }}>{u.name}</span>
              <span className="text-white/45 font-medium truncate" style={{ fontSize: 15 }}>{u.artists}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-center gap-6 shrink-0 text-white">
        {!guest && <Press onClick={() => controlSpotify("previous")} className="flex items-center justify-center" style={{ width: 96, height: 96 }}><Icon d={PREV} size={52} /></Press>}
        <Press onClick={() => controlSpotify(np.isPlaying ? "pause" : guest ? "pause" : "play")} className="flex items-center justify-center text-black" style={{ width: 150, height: 150, borderRadius: 75, background: "#fff", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" }}>
          <Icon d={np.isPlaying ? PAUSE : PLAY} size={74} />
        </Press>
        {!guest && <Press onClick={() => controlSpotify("next")} className="flex items-center justify-center" style={{ width: 96, height: 96 }}><Icon d={NEXT} size={52} /></Press>}
      </div>
    </div>
  );
}

function MediaRow({ e, act, accent }: { e: HomeEntity; act: Act; accent: string }) {
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
      <TimerRow e={e} compact />
    </div>
  );
}

function MusicSheet({ musicLights, nightVolume, accent, music, media, speakers, setVolume, act, onClose, message, setMessage }: {
  musicLights: { cfg: MusicLightsCfg; set: (on: boolean) => void; pick: (id: string) => void; lights: HomeEntity[]; active: string[]; palette: string[] };
  nightVolume: { volume: number; save: (v: number) => void }; accent: string; music: MusicApi; media: HomeEntity[]; speakers: HomeEntity[]; setVolume: (v: number) => void; act: Act; onClose: () => void; message: string | null; setMessage: (m: string | null) => void;
}) {
  const np = useNowPlaying();
  const track = np?.track ?? null;
  const progress = useEstimatedProgress(track, np?.isPlaying ?? false, np?.fetchedAt);
  const [vol, setVol] = useState<number | null>(null);
  const shown = vol ?? (speakers.length ? avg(speakers.map((s) => s.volume ?? 0)) : np?.volumePercent ?? 50);
  const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  const { lib, error } = music;
  const [busy, setBusy] = useState<string | null>(null);
  const [network, setNetwork] = useState(false);
  const [nvLive, setNvLive] = useState<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playIt = async (uri: string) => {
    setBusy(uri);
    setMessage(playError(await music.play(uri)));
    setTimeout(() => setBusy(null), 3000);
  };
  return (
    <Sheet title="Music" onClose={onClose} width={860} glow={accent}>
      {message && <div className="glass-card text-white/80 font-semibold" style={{ borderRadius: 24, padding: "14px 20px", fontSize: 16 }}>{message}</div>}
      {track && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-5 items-center">
            {track.albumArtUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external Spotify CDN image
              <img src={track.albumArtUrl} alt="" className="object-cover shrink-0" style={{ width: 150, height: 150, borderRadius: 36, boxShadow: `0 10px 36px ${withAlpha(accent, 44)}` }} />
            )}
            <div className="min-w-0 flex-1">
              <FitText lines={2} className="text-white font-bold leading-tight" style={{ fontSize: 30 }}>{track.name}</FitText>
              <FitText className="text-white/60 font-medium" style={{ fontSize: 20 }}>{track.artists}</FitText>
            </div>
          </div>
          <div>
            <div className="rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.18)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (progress / track.durationMs) * 100)}%`, background: `linear-gradient(90deg, ${withAlpha(accent, 65)}, ${accent})` }} />
            </div>
            <div className="flex justify-between num-rounded font-semibold text-white/45 mt-1.5" style={{ fontSize: 14 }}><span>{fmt(progress)}</span><span>{fmt(track.durationMs)}</span></div>
          </div>
          <div className="flex items-center justify-center gap-10 text-white">
            <Press onClick={() => controlSpotify("previous")} className="p-3"><Icon d={PREV} size={44} /></Press>
            <Press onClick={() => controlSpotify(np?.isPlaying ? "pause" : "play")} className="glass-card flex items-center justify-center" style={{ width: 84, height: 84, borderRadius: 42 }}>
              <Icon d={np?.isPlaying ? PAUSE : PLAY} size={42} />
            </Press>
            <Press onClick={() => controlSpotify("next")} className="p-3"><Icon d={NEXT} size={44} /></Press>
          </div>
        </div>
      )}

      <div>
        <div className="caps-label mb-2" style={{ fontSize: 13 }}>Volume · {speakers.length > 1 ? `all ${speakers.length} speakers` : speakers[0]?.name ?? "Spotify"} · {shown}%</div>
        <Slider value={shown} onChange={setVol} onCommit={(v) => { setVolume(v); setTimeout(() => setVol(null), 1500); }} accent={accent} height={56} />
      </div>

      {musicLights.lights.length > 0 && (
        <div className="glass-card flex flex-col gap-3" style={{ borderRadius: 30, padding: "18px 24px" }}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-white font-bold" style={{ fontSize: 22 }}>Music lights</div>
              <div className="text-white/55 font-semibold" style={{ fontSize: 14 }}>The lights below take colors from each song’s album art, and change with every song.</div>
            </div>
            <Toggle on={musicLights.cfg.enabled} onChange={musicLights.set} />
          </div>
          {musicLights.palette.length > 0 && (
            <div className="flex gap-2">{musicLights.palette.map((c) => <span key={c} className="rounded-full" style={{ width: 28, height: 28, background: c, boxShadow: `0 0 14px ${withAlpha(c, 70)}` }} />)}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {musicLights.lights.map((l) => {
              const on = musicLights.active.includes(l.id);
              return (
                <Press key={l.id} onClick={() => musicLights.pick(l.id)} className="px-4 py-2 font-semibold" style={{ borderRadius: 20, fontSize: 15, background: on ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)", color: on ? "#000" : "#fff" }}>{l.name}</Press>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="caps-label mb-2" style={{ fontSize: 13 }}>Night volume · speakers go to {nightVolume.volume}% on “It’s the night”</div>
        <Slider value={nvLive ?? nightVolume.volume} onChange={setNvLive} onCommit={(v) => { nightVolume.save(v); setNvLive(null); }} accent={accent} height={44} />
      </div>

      <div>
        <div className="caps-label mb-3" style={{ fontSize: 13 }}>Playlists{lib?.defaults.name ? ` · default: ${lib.defaults.name}` : " · tap the star to set a default"}</div>
        {error === "reconnect" && (
          <div className="glass-card flex items-center justify-between gap-4" style={{ borderRadius: 28, padding: "18px 22px" }}>
            <div className="text-white/80 font-semibold" style={{ fontSize: 17 }}>Spotify needs one more permission to read your playlists.</div>
            <a href="/api/auth/spotify/start" className="px-6 py-3 text-black font-bold shrink-0" style={{ borderRadius: 24, background: accent, fontSize: 17 }}>Reconnect</a>
          </div>
        )}
        {error === "failed" && <div className="text-white/50 font-semibold" style={{ fontSize: 16 }}>Couldn&apos;t load playlists.</div>}
        {!lib && !error && <div className="text-white/50 font-semibold" style={{ fontSize: 16 }}>Loading playlists…</div>}
        {lib && (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
            {lib.playlists.map((p) => {
              const isDefault = lib.defaults.uri === p.uri;
              return (
                <div key={p.uri} className="relative">
                  <Press onClick={() => playIt(p.uri)} className="glass-card flex flex-col text-left w-full overflow-hidden" style={{ borderRadius: 30, boxShadow: busy === p.uri ? `0 0 0 3px ${accent}` : undefined }}>
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- external Spotify CDN image
                      <img src={p.image} alt="" className="object-cover w-full" style={{ aspectRatio: "1" }} />
                    ) : <div className="w-full bg-white/10" style={{ aspectRatio: "1" }} />}
                    <div style={{ padding: "12px 16px 16px" }}>
                      <FitText className="text-white font-bold" style={{ fontSize: 18 }}>{p.name}</FitText>
                      <div className="text-white/50 font-semibold" style={{ fontSize: 13 }}>{busy === p.uri ? "Starting…" : `${p.tracks} songs`}</div>
                    </div>
                  </Press>
                  <button
                    aria-label={isDefault ? "Default playlist" : "Make default"}
                    onClick={() => music.saveDefaults({ uri: p.uri, name: p.name })}
                    className="absolute top-3 right-3 flex items-center justify-center touch-manipulation"
                    style={{ width: 48, height: 48, borderRadius: 24, background: isDefault ? accent : "rgba(0,0,0,0.55)", color: isDefault ? "#000" : "#fff" }}
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill={isDefault ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lib && (
        <div>
          {/* press and hold the label: reveals every speaker on the network, matched to Spotify */}
          <div
            className="caps-label mb-3 select-none"
            style={{ fontSize: 13 }}
            onPointerDown={() => { holdTimer.current = setTimeout(() => setNetwork((n) => !n), 700); }}
            onPointerUp={() => { if (holdTimer.current) clearTimeout(holdTimer.current); }}
            onPointerLeave={() => { if (holdTimer.current) clearTimeout(holdTimer.current); }}
          >
            Play on{network ? " · all speakers" : ""}{lib.defaults.deviceName ? ` · default: ${lib.defaults.deviceName}` : ""}
          </div>
          <div className="flex flex-wrap gap-2">
            {(network ? lib.network : lib.devices.map((d) => ({ name: d.name, deviceId: d.id, entityId: null as string | null, active: d.active }))).map((d) => {
              const chosen = lib.defaults.deviceName ? normName(lib.defaults.deviceName) === normName(d.name) : d.active;
              return (
                <Press
                  key={`${d.deviceId}-${d.entityId}-${d.name}`}
                  onClick={() => music.saveDefaults(chosen && lib.defaults.deviceName ? { deviceId: null, deviceName: null, entityId: null } : { deviceId: d.deviceId, deviceName: d.name, entityId: d.entityId })}
                  className="px-5 py-3 font-semibold"
                  style={{ borderRadius: 24, fontSize: 17, background: chosen ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.12)", color: chosen ? "#000" : "#fff", opacity: network && !d.deviceId ? 0.7 : 1 }}
                >
                  {d.name}{network && !d.deviceId ? " · asleep" : ""}
                </Press>
              );
            })}
            {!network && lib.devices.length === 0 && <div className="text-white/50 font-semibold" style={{ fontSize: 15 }}>No Spotify speakers awake. Press and hold this label to see all speakers.</div>}
          </div>
        </div>
      )}

      {media.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="caps-label" style={{ fontSize: 13 }}>Speakers &amp; TVs</div>
          {media.map((m) => <MediaRow key={m.id} e={m} act={act} accent={accent} />)}
        </div>
      )}
    </Sheet>
  );
}

/** Name the current lights as a scene (uses the tablet's on-screen keyboard). */
function SaveSceneSheet({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75" onClick={onClose}>
      <div className="glass-card w-[560px] flex flex-col gap-5" style={{ borderRadius: 44, padding: 34, background: "rgba(14,14,18,0.97)" }} onClick={(ev) => ev.stopPropagation()}>
        <div className="text-white font-bold" style={{ fontSize: 26 }}>Save the lights as a scene</div>
        <div className="text-white/55 font-semibold" style={{ fontSize: 16 }}>Brightness, warmth and color are remembered exactly as they are now.</div>
        <input
          autoFocus
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          placeholder="Scene name, e.g. Reading"
          className="bg-white/10 text-white rounded-3xl px-6 py-4 outline-none"
          style={{ fontSize: 22 }}
        />
        <div className="flex gap-3 justify-end">
          <Press onClick={onClose} className="glass-card px-7 py-3 text-white/80 font-semibold" style={{ borderRadius: 24, fontSize: 18 }}>Cancel</Press>
          <Press onClick={() => { if (name.trim()) { onSave(name.trim()); onClose(); } }} className="px-7 py-3 text-black font-bold" style={{ borderRadius: 24, fontSize: 18, background: "var(--accent)" }}>Save</Press>
        </div>
      </div>
    </div>
  );
}

/** Owner unlock: the PIN is asked for again, because the tablet itself remembers it for normal use. */
function UnlockSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="absolute inset-0 z-[48] flex items-center justify-center bg-black/80" onClick={onClose}>
      <div onClick={(ev) => ev.stopPropagation()} className="flex flex-col items-center gap-4">
        <div className="text-white font-bold" style={{ fontSize: 30 }}>Owner unlock</div>
        <PinPad
          gate={bad ? "bad_pin" : null}
          onSubmit={async (pin) => {
            if (busy) return;
            setBusy(true);
            try {
              const res = await fetch("/api/home/guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, action: "unlock" }) });
              if (res.ok) { onDone(); onClose(); } else setBad(true);
            } catch { setBad(true); }
            setBusy(false);
          }}
        />
        <Press onClick={onClose} className="glass-card px-8 py-3 text-white/80 font-semibold" style={{ borderRadius: 24, fontSize: 18 }}>Cancel</Press>
      </div>
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

type SheetState = null | { type: "light"; id: string } | { type: "room"; room: string } | { type: "all" } | { type: "music" };

export function TouchControl() {
  const scale = useScale();
  const cw = useCanvasWidth(scale);
  const np = useNowPlaying();
  const { playing, artUrl } = useStickyPlaying(np);
  const { backdrop, accent, palette } = useArtTheme(artUrl);
  const color = playing ? accent : NEUTRAL_ACCENT;

  const [pin, setPin] = useState<string | null>(null);
  useEffect(() => {
    try { setPin(localStorage.getItem(PIN_KEY)); } catch { /* private mode */ }
  }, []);
  const { snap, gate, error, act, load, saveScene, syncing, setAway, setKeep, goNight, colorMany, setTimer, cancelTimer } = useHome(pin);
  useAutoUpdate();
  const guest = Boolean(snap?.guest?.active);
  const presence = useRef(false);
  const { level: dimLevel, idle, activity, sleep } = useDimmer(presence);
  const wake = activity;

  // Dimmed screens poll Spotify rarely; on wake everything refreshes at once so the first glance is current.
  const wasIdle = useRef(false);
  useEffect(() => {
    setNowPlayingDimmed(idle);
    if (wasIdle.current && !idle) load();
    wasIdle.current = idle;
  }, [idle, load]);

  // Wake on approach: a per-tablet switch, because it needs this tablet's camera permission.
  const [wakeCam, setWakeCam] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("hb-wake-camera") === "1"; } catch { return false; }
  });
  const [camAsk, setCamAsk] = useState<string | null>(null);
  const toggleWakeCam = () => {
    const next = !wakeCam;
    setWakeCam(next);
    setCamAsk(null);
    try { localStorage.setItem("hb-wake-camera", next ? "1" : "0"); } catch { /* ignore */ }
    // Ask for the camera right now, from this tap, so the permission prompt shows while you're looking at the screen.
    if (next && !getFully()) {
      const why = !window.isSecureContext ? "this page isn't secure (needs https)"
        : window.self !== window.top ? "this page is inside another page (an iframe), which blocks the camera"
        : !navigator.mediaDevices ? "this browser has no camera access"
        : null;
      if (why) { setCamAsk(why); return; }
      navigator.mediaDevices.getUserMedia({ video: true }).then((st) => st.getTracks().forEach((t) => t.stop())).catch((e: Error) => setCamAsk(`${e.name}: the browser refused (${e.message || "no reason given"})`));
    }
  };
  const away = Boolean(snap?.away);
  // Away from home: lights are off, waiting for you. Give the departure a minute before a face counts as "back".
  const awaySince = useRef(0);
  useEffect(() => { if (away) awaySince.current = Date.now(); }, [away]);
  // At night with every light off, movement in the room must not light the tablet up again.
  const nightQuiet = isNight() && !(snap?.entities ?? []).some((e) => (e.kind === "light" || e.kind === "switch") && e.on);
  const onApproach = () => {
    if (away && !guest && Date.now() - awaySince.current > 60_000) setAway("return");
    if (!nightQuiet) activity(); // someone's there: back to full brightness and restart the dim timer
  };
  const motionSensors = useHaMotion(pin, wakeCam, onApproach);
  useEffect(() => { presence.current = wakeCam && motionSensors > 0; });
  // With a Home Assistant motion sensor (or the tablet streaming its camera there) the browser doesn't need the camera.
  const camStatus = useApproach(wakeCam && (idle || away) && motionSensors === 0, onApproach);
  // Lights all off after 9pm: the tablet goes fully dark too (screen off, no light at all). The power button or a touch wakes it.
  const forcedOff = useRef(false);
  const nightOff = () => {
    if (!isNight() || !pin) return;
    forcedOff.current = true; // no brightness/wake commands from the dimmer until someone actually uses the tablet again
    sleep();
    const off = () => fetch("/api/home/screen", { method: "POST", headers: { "Content-Type": "application/json", "x-control-pin": pin }, body: JSON.stringify({ mode: "off" }) }).catch(() => {});
    setTimeout(off, 400);
    setTimeout(off, 4000); // again, in case something nudged the screen back on
  };
  // Real backlight dimming through the Home Assistant app, stepping down with the on-screen fade and back up on any activity.
  const lastStep = useRef(0);
  useEffect(() => {
    if (!pin || getFully()) return;
    const step = dimLevel <= 0 ? 0 : Math.min(5, Math.ceil(dimLevel * 5));
    if (step === lastStep.current) return;
    lastStep.current = step;
    if (forcedOff.current) { if (step === 0) forcedOff.current = false; else return; } // screen was powered off on purpose
    const levels = [0, 130, 95, 60, 30, 1];
    fetch("/api/home/screen", { method: "POST", headers: { "Content-Type": "application/json", "x-control-pin": pin }, body: JSON.stringify(step === 0 ? { mode: "wake" } : { mode: "level", level: levels[step] }) }).catch(() => {});
  }, [dimLevel, pin]);
  // On Fully Kiosk, really dim the backlight while idle (the black overlay can't turn an LCD off), and put it back on wake.
  useEffect(() => {
    const fully = getFully();
    if (!fully?.setScreenBrightness) return;
    try {
      if (idle) {
        const cur = fully.getScreenBrightness?.();
        if (typeof cur === "number" && cur > 5) localStorage.setItem("hb-prev-brightness", String(cur));
        fully.setScreenBrightness(1);
      } else {
        const prev = Number(localStorage.getItem("hb-prev-brightness"));
        fully.setScreenBrightness(prev > 5 ? prev : 160);
      }
    } catch { /* not in Fully, or storage blocked */ }
  }, [idle]);
  // Or: a phone (Home Assistant person) that was away shows up home while we're waiting.
  const wasHome = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const ppl = snap?.people ?? [];
    const cameHome = ppl.some((p) => p.home && wasHome.current[p.name] === false);
    wasHome.current = Object.fromEntries(ppl.map((p) => [p.name, p.home]));
    if (away && cameHome) setAway("return");
  }, [snap, away, setAway]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const music = useLibrary(pin);
  // Album-art lights: each new song recolours the chosen lights (default: the Light Bars) from the artwork.
  const [ml, setMl] = useState<MusicLightsCfg>(() => (typeof window === "undefined" ? { enabled: false, ids: [], restore: {} } : readMusicLights()));
  const saveMl = (next: MusicLightsCfg) => { setMl(next); try { localStorage.setItem(ML_KEY, JSON.stringify(next)); } catch { /* ignore */ } };
  const colorLights = (snap?.entities ?? []).filter((e) => e.kind === "light" && e.supportsColor);
  const mlTargets = (ids: string[]) => (ids.length ? colorLights.filter((l) => ids.includes(l.id)) : colorLights.filter((l) => /light bar/i.test(l.name)));
  const appliedKey = useRef("");
  useEffect(() => {
    if (guest || !ml.enabled || !playing || !palette.length || !np?.track) return;
    const key = `${np.track.id}|${palette.join(",")}`;
    if (appliedKey.current === key) return;
    const targets = mlTargets(ml.ids).filter((l) => l.available);
    if (!targets.length) return;
    appliedKey.current = key;
    colorMany(targets.map((l, i) => { const [h, s] = hexToHs(palette[i % palette.length]); return { id: l.id, h, s }; }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-applies only when the song or its palette changes
  }, [guest, ml.enabled, ml.ids, playing, palette, np?.track?.id, colorMany]);
  /** Switch the album-art lights on (remembering how those lights were) or off (putting them back). */
  const setMusicLights = (on: boolean) => {
    if (on) {
      const targets = mlTargets(ml.ids);
      const restore: MusicLightsCfg["restore"] = {};
      for (const l of targets) restore[l.id] = { on: Boolean(l.on), brightness: l.brightness, colorTemp: l.colorTemp, hs: l.hs };
      appliedKey.current = "";
      saveMl({ ...ml, enabled: true, restore });
    } else {
      for (const [id, r] of Object.entries(ml.restore)) {
        if (!r.on) act(id, { type: "off" });
        else if (r.hs) act(id, { type: "color", h: r.hs[0], s: r.hs[1] });
        else if (r.colorTemp) act(id, { type: "colorTemp", value: r.colorTemp });
        else act(id, { type: "on" });
        if (r.on && r.brightness != null) act(id, { type: "brightness", value: r.brightness });
      }
      saveMl({ ...ml, enabled: false, restore: {} });
    }
  };
  const loadLibrary = music.load;
  useEffect(() => { if (!gate) loadLibrary(); }, [gate, loadLibrary]);
  useEffect(() => { if (sheet?.type === "music") loadLibrary(); }, [sheet?.type, loadLibrary]);

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
  const lights = devices.filter((d) => d.kind === "light");
  const fans = entities.filter((e) => e.kind === "fan");
  const rooms = [...new Set(devices.map((d) => d.room))].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  // The main volume slider drives every speaker (not TVs) so it actually moves the sound.
  const speakers = media.filter((m) => m.volume != null && m.available && !/\b(tv|uhd|crystal)\b/i.test(m.name));
  const nightVol = useNightVolume(pin);
  const night = isNight();
  const depth = now ? nightDepth(now) : 0;
  const setVolume = (v: number) => (speakers.length ? act(speakers.map((s) => s.id), { type: "volume", value: v }) : controlSpotify("volume", v));
  const rightW = Math.min(600, Math.max(460, Math.round(cw * 0.36)));
  const leftW = cw - rightW - 50 - 40 - 50;
  // the big "All lights" card scales down on narrow screens instead of wrapping into the Turn off all button
  const fit = Math.max(0.55, Math.min(1, leftW / 780));
  const time = now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const keepOn = snap?.keepOn ?? [];
  // "All lights" leaves flagged lights alone; the top-right button turns everything off.
  const included = devices.filter((d) => !keepOn.includes(d.id));
  const allTargets = included.length ? included : devices;
  const anyOn = allTargets.some((d) => d.on);
  const anythingOn = devices.some((d) => d.on);

  return (
    <TimerCtx.Provider value={{ timers: snap?.timers ?? {}, set: setTimer, cancel: cancelTimer }}>
    <div className="fixed inset-0 bg-black overflow-hidden text-white" style={{ ["--accent" as string]: color }}>
      <Backdrop art={backdrop} playing={playing} accent={color} />
      <div className="absolute" style={{ left: "50%", top: "50%", width: cw, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {gate ? (
          <div className="absolute inset-0 flex items-center justify-center"><PinPad gate={gate} onSubmit={submitPin} /></div>
        ) : (
          <>
            {/* left: all lights, rooms, then (scroll) individual lights */}
            <div className="absolute flex flex-col" style={{ left: 50, top: 78, width: leftW, height: 796 }}>
              <div className="flex items-end justify-end mb-3 shrink-0">
                {snap?.provider === "demo" && (
                  <div className="glass-card px-5 py-2 text-white/60 font-semibold" style={{ borderRadius: 24, fontSize: 14 }}>
                    Demo devices — connect Home Assistant in Control
                  </div>
                )}
              </div>
              {error && !snap && <div className="glass-card px-6 py-4 text-white/70 font-semibold" style={{ borderRadius: 28, fontSize: 18 }}>{error}</div>}

              {devices.length > 0 && (
                <div className="relative shrink-0" style={{ height: 400, marginBottom: 28 }}>
                <ToggleButton
                  on={anyOn}
                  glow={groupGlow(allTargets)}
                  onTap={() => { act(allTargets.map((d) => d.id), { type: anyOn ? "off" : "on" }); if (anyOn) nightOff(); }}
                  onLong={guest ? undefined : () => setSheet({ type: "all" })}
                  style={{ width: "100%", height: "100%", padding: `0 ${Math.round(64 * fit)}px`, borderRadius: 64 }}
                >
                  <div className="flex items-center" style={{ gap: Math.round(56 * fit) }}>
                    <SegmentBulb lights={lights.length ? lights : devices} size={Math.round(230 * fit)} />
                    <div className="min-w-0">
                      <div className="text-white font-bold whitespace-nowrap" style={{ fontSize: Math.round(88 * fit), lineHeight: 1.02 }}>All lights</div>
                      <div className="text-white/65 font-semibold mt-2" style={{ fontSize: Math.round(30 * fit) }}>{anyOn ? `${devices.filter((d) => d.on).length} of ${devices.length} on · tap to turn off` : "Off · tap to turn on"}{keepOn.length > 0 ? ` · ${keepOn.length} stay${keepOn.length === 1 ? "s" : ""} on` : ""}</div>
                      <div className="text-white/35 font-semibold mt-1" style={{ fontSize: Math.round(19 * fit) }}>Hold for color &amp; scenes</div>
                    </div>
                  </div>
                </ToggleButton>
                  <Press
                    onClick={() => { act(devices.map((d) => d.id), { type: "off" }); nightOff(); }}
                    className="absolute font-bold"
                    style={{ top: 22, right: 26, padding: "14px 26px", borderRadius: 26, fontSize: 19, background: anythingOn ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.25)", color: anythingOn ? "#fff" : "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.22)" }}
                  >
                    Turn off all
                  </Press>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "none", margin: "-24px -40px -40px", padding: "24px 40px 40px", maskImage: "linear-gradient(180deg, transparent 0, #000 22px, #000 calc(100% - 30px), transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 22px, #000 calc(100% - 30px), transparent 100%)" }}>
                <div style={{ minHeight: "100%" }}>
                  <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
                    {rooms.map((room) => {
                      const inRoom = devices.filter((d) => d.room === room);
                      const roomOn = inRoom.some((d) => d.on);
                      return (
                        <ToggleButton key={room} on={roomOn} glow={groupGlow(inRoom)} onTap={() => act(inRoom.map((d) => d.id), { type: roomOn ? "off" : "on" })} onLong={guest ? undefined : () => setSheet({ type: "room", room })} style={{ height: 88, padding: "0 22px", borderRadius: 30 }}>
                          <div className="flex items-center gap-3">
                            <SegmentBulb lights={inRoom} size={40} />
                            <div className="min-w-0 flex-1">
                              <FitText className="text-white font-bold" style={{ fontSize: 21 }}>{room}</FitText>
                              <div className="text-white/60 font-semibold" style={{ fontSize: 14 }}>{inRoom.filter((d) => d.on).length} of {inRoom.length} on</div>
                            </div>
                          </div>
                        </ToggleButton>
                      );
                    })}
                  </div>
                  {fans.length > 0 && (
                    <div className="flex flex-col gap-3 mt-5">
                      <div className="caps-label" style={{ fontSize: 13 }}>Fans</div>
                      {fans.map((f) => <FanCard key={f.id} e={f} act={act} />)}
                    </div>
                  )}
                  {devices.length > 0 && !guest && (night && !away ? (
                    /* after 9pm "I'm leaving" becomes "It's the night", and grows the later it gets */
                    <Press
                      onClick={() => { goNight(speakers.map((m) => m.id)); nightOff(); }}
                      className="w-full flex flex-col items-center justify-center gap-1 mt-4 font-bold"
                      style={{ height: Math.round(110 + 190 * depth), borderRadius: Math.round(40 + 24 * depth), fontSize: Math.round(30 + 34 * depth), color: "#fff", background: `linear-gradient(135deg, rgba(60,70,160,${0.45 + 0.35 * depth}), rgba(20,20,60,${0.7 + 0.25 * depth}))`, border: "1px solid rgba(160,170,255,0.35)", boxShadow: `0 0 ${Math.round(20 + 50 * depth)}px -8px rgba(120,130,255,0.8)` }}
                    >
                      <span>It’s the night</span>
                      <span className="text-white/60 font-semibold" style={{ fontSize: Math.round(15 + 7 * depth) }}>Every light off · speakers to {nightVol.volume}% · tablet off</span>
                    </Press>
                  ) : (
                    <Press
                      onClick={() => { if (away) setAway("return"); else { setAway("leave"); setTimeout(sleep, 2500); } }}
                      className="w-full flex items-center justify-center gap-4 mt-4 font-bold"
                      style={{ height: 110, borderRadius: 40, fontSize: 28, color: away ? "#000" : "#fff", background: away ? color : "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: away ? `0 0 40px -8px ${color}` : undefined }}
                    >
                      I’m leaving — lights off, back on when I return
                    </Press>
                  ))}
                  {devices.length > 0 && <div className="text-white/30 font-semibold text-center mt-6" style={{ fontSize: 15 }}>Scroll for individual lights ↓</div>}
                </div>
                {devices.length > 0 && (
                  <div className="pb-10">
                    <div className="caps-label mb-3" style={{ fontSize: 13 }}>Individual lights</div>
                    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
                      {devices.map((d) => (d.kind === "light" ? <LightTile key={d.id} e={d} act={act} onOpen={guest ? undefined : () => setSheet({ type: "light", id: d.id })} syncing={syncing.has(d.id)} /> : <SwitchTile key={d.id} e={d} act={act} onOpen={guest ? undefined : () => setSheet({ type: "light", id: d.id })} />))}
                    </div>
                  </div>
                )}
                {snap && !guest && (
                  <div className="pb-4 flex items-center gap-4 flex-wrap">
                    <Press
                      onClick={() => {
                        const order = ["auto", "on", "off"] as const;
                        const cur = snap.guest?.mode ?? "auto";
                        const next = order[(order.indexOf(cur) + 1) % 3];
                        fetch("/api/home/guest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, action: "mode", mode: next }) }).then(() => load()).catch(() => {});
                      }}
                      className="glass-card px-6 py-4 text-white font-semibold"
                      style={{ borderRadius: 28, fontSize: 18 }}
                    >
                      Guest mode: {snap.guest?.mode === "on" ? "Always on" : snap.guest?.mode === "off" ? "Off" : "Auto (when I’m away)"}
                    </Press>
                  </div>
                )}
                {snap && !guest && (
                  <div className="pb-10 flex items-center gap-4">
                    <Press onClick={toggleWakeCam} className="glass-card px-6 py-4 text-white font-semibold" style={{ borderRadius: 28, fontSize: 18 }}>
                      Wake on approach: {wakeCam ? "On" : "Off"}
                    </Press>
                    <div className="text-white/45 font-semibold" style={{ fontSize: 15 }}>
                      {motionSensors > 0 ? `Using ${motionSensors} Home Assistant motion sensor${motionSensors > 1 ? "s" : ""} — no camera needed in the browser.` : camAsk ? `Camera unavailable: ${camAsk}` : camStatus === "denied" ? "Camera blocked — allow it for this app in Android settings" : camStatus === "error" ? "Couldn’t start face detection" : getFully() ? "Uses Fully Kiosk’s motion detection while dimmed or away, and dims the backlight when idle." : "Uses the camera on this tablet only while it’s dimmed or you’re away. Nothing is saved or sent."}
                    </div>
                  </div>
                )}
                {snap && devices.length === 0 && <div className="text-white/45 font-semibold" style={{ fontSize: 20 }}>No lights or switches found.</div>}
              </div>
            </div>

            {/* right: music, as tall as the screen allows */}
            <div className="absolute flex flex-col gap-3" style={{ left: cw - rightW - 50, top: 90, width: rightW }}>
              <MusicController guest={guest} accent={color} music={music} pin={pin} onOpen={() => { if (!guest) setSheet({ type: "music" }); }} setMessage={setMessage} height={message && sheet?.type !== "music" ? 690 : 770} />
              {message && sheet?.type !== "music" && <div className="glass-card text-white/80 font-semibold" style={{ borderRadius: 24, padding: "12px 20px", fontSize: 16 }}>{message}</div>}
            </div>
          </>
        )}
        {sheet?.type === "light" && snap && (() => {
          const e = snap.entities.find((x) => x.id === sheet.id);
          return e ? <LightsSheet title={e.name} lights={[e]} act={act} accent={color} onClose={() => setSheet(null)} keepOn={keepOn} onKeep={setKeep} /> : null;
        })()}
        {sheet?.type === "room" && <LightsSheet title={sheet.room} lights={devices.filter((d) => d.room === sheet.room)} act={act} accent={color} onClose={() => setSheet(null)} keepOn={keepOn} onKeep={setKeep} />}
        {sheet?.type === "all" && (
          <LightsSheet
            title="All lights"
            lights={devices}
            act={act}
            accent={color}
            onClose={() => setSheet(null)}
            keepOn={keepOn}
            onKeep={setKeep}
            extras={
              <div className="flex flex-col gap-3">
                <div className="caps-label" style={{ fontSize: 13 }}>Scenes</div>
                <div className="flex flex-wrap gap-3">
                  {scenes.map((s) => <SceneButton key={s.id} e={s} act={act} accent={color} />)}
                  {lights.length > 0 && (
                    <Press onClick={() => { setSheet(null); setSaving(true); }} className="flex items-center gap-3 px-6 shrink-0 text-white/70 font-semibold" style={{ height: 92, borderRadius: 30, border: "2px dashed rgba(255,255,255,0.25)", fontSize: 20 }}>
                      + Save scene
                    </Press>
                  )}
                </div>
              </div>
            }
          />
        )}
        {sheet?.type === "music" && (
          <MusicSheet musicLights={{ cfg: ml, set: setMusicLights, pick: (id: string) => { const cur = ml.ids.length ? ml.ids : mlTargets([]).map((l) => l.id); saveMl({ ...ml, ids: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }); appliedKey.current = ""; }, lights: colorLights, active: mlTargets(ml.ids).map((l) => l.id), palette }} nightVolume={nightVol} accent={color} music={music} media={media} speakers={speakers} setVolume={setVolume} act={act} onClose={() => setSheet(null)} message={message} setMessage={setMessage} />
        )}
        {saving && <SaveSceneSheet onSave={saveScene} onClose={() => setSaving(false)} />}
      </div>
      <TopBar showTime selfBattery pin={pin} />
      <ActivityPills includeMusic={false} hide={["game"]} />
      {guest && !gate && (
        <div className="absolute bottom-5 left-1/2 z-[44] flex items-center gap-3" style={{ transform: "translateX(-50%)" }}>
          <div className="glass-card px-6 py-3 text-white/80 font-semibold" style={{ borderRadius: 26, fontSize: 17 }}>Guest mode · lights on/off only · no music</div>
          <Press onClick={() => setUnlocking(true)} className="glass-card px-6 py-3 text-white font-semibold" style={{ borderRadius: 26, fontSize: 17 }}>🔒 Owner unlock</Press>
        </div>
      )}
      {unlocking && <UnlockSheet onClose={() => setUnlocking(false)} onDone={() => load()} />}
      {/* away: the whole screen is one "Welcome back" button, ahead of anything else */}
      {away && !gate && !guest && (
        <button
          onClick={() => setAway("return")}
          className="absolute inset-0 z-[45] flex flex-col items-center justify-center gap-6 touch-manipulation select-none"
          style={{ backgroundColor: "#050507", backgroundImage: `radial-gradient(90% 70% at 50% 40%, ${withAlpha(color, 40)}, transparent 75%)`, border: "none" }}
        >
          <span className="text-white font-bold" style={{ fontSize: 96, lineHeight: 1 }}>Welcome back</span>
          <span className="text-white/65 font-semibold" style={{ fontSize: 30 }}>Tap anywhere to turn your lights on and resume your music</span>
        </button>
      )}
      {/* fully dim when untouched: pure black (off on OLED), a faint clock, touch to wake */}
      <div
        onPointerDown={() => { if (away && !guest) setAway("return"); wake(); }}
        className="absolute inset-0 z-50 bg-black flex items-center justify-center"
        style={{ opacity: dimLevel, pointerEvents: idle ? "auto" : "none", transition: dimLevel === 0 ? "opacity 0.12s ease-out" : "opacity 0.3s linear" }}
      >
        <div className="num-rounded font-semibold" style={{ fontSize: 120, color: "rgba(255,255,255,0.12)" }}>{time}</div>
        {(away || camStatus === "on") && (
          <div className="absolute bottom-10 flex items-center gap-3 font-semibold" style={{ fontSize: 16, color: "rgba(255,255,255,0.22)" }}>
            {camStatus === "on" && <span className="rounded-full" style={{ width: 10, height: 10, background: "#ff5a4f" }} />}
            {away ? "Away · lights return when you do" : "Camera on · wake on approach"}
          </div>
        )}
      </div>
    </div>
    </TimerCtx.Provider>
  );
}
