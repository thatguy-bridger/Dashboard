"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Device, Home } from "@/lib/ha";

type Ev = { title: string; start: number; end: number; allDay?: boolean; color?: string };
type Music = { playing: boolean; track: string; artist: string; album?: string; art?: string; progress: number; duration: number; at: number; device?: string; volume?: number };
type Screen = {
  screen: { widgets?: string[]; accent?: string; name?: string; hideRooms?: string[]; hours24?: boolean } | null;
  agenda: { events: Ev[] } | null; music: Music | null; status: { away?: boolean; at?: number } | null;
  weather: { current?: { temperature_2m: number; weather_code: number; is_day?: number }; daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[] } } | null;
  now: number;
};

const WMO: Record<number, string> = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain", 71: "Snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Downpour", 95: "Thunderstorm" };
const PIN_KEY = "dash-pin";

function useApi() {
  const [pin, setPin] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => { try { setPin(localStorage.getItem(PIN_KEY)); } catch {} setChecked(true); }, []);
  const call = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(path, { ...init, headers: { "x-control-pin": pin ?? "", "Content-Type": "application/json" }, cache: "no-store" });
    if (r.status === 401) { try { localStorage.removeItem(PIN_KEY); } catch {} setPin(null); throw new Error("locked"); }
    return r;
  }, [pin]);
  const unlock = async (p: string) => {
    const r = await fetch("/api/unlock", { method: "POST", headers: { "x-control-pin": p } });
    if (r.ok) { try { localStorage.setItem(PIN_KEY, p); } catch {} setPin(p); return true; }
    return false;
  };
  return { pin, checked, call, unlock };
}

export default function Page() {
  const api = useApi();
  const [scr, setScr] = useState<Screen | null>(null);
  const [home, setHome] = useState<Home | null>(null);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!api.pin) return;
    let stop = false;
    const load = async () => { try { const r = await api.call("/api/screen"); if (r.ok && !stop) setScr(await r.json()); } catch {} };
    load(); const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [api.pin, api.call]);
  useEffect(() => {
    if (!api.pin) return;
    let stop = false;
    const load = async () => { try { const r = await api.call("/api/home"); if (r.ok && !stop) setHome(await r.json()); } catch {} };
    load(); const t = setInterval(load, open ? 3000 : 20000);
    return () => { stop = true; clearInterval(t); };
  }, [api.pin, api.call, open]);

  const accent = scr?.screen?.accent ?? "#7c8cff";
  useEffect(() => { document.documentElement.style.setProperty("--accent", accent); }, [accent]);

  if (!api.checked) return null;
  if (!api.pin) return <PinPad unlock={api.unlock} />;

  const widgets = scr?.screen?.widgets ?? ["clock", "weather", "agenda", "music"];
  const d = new Date(tick);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !scr?.screen?.hours24 }).replace(/\s?(AM|PM)/i, "");
  const away = !!scr?.status?.away || !!home?.away;

  const upcoming = (scr?.agenda?.events ?? []).filter((e) => e.end * 1000 > tick);
  const first = upcoming[0];
  const m = scr?.music ?? null;
  const sendMusic = (cmd: Record<string, unknown>) => post(api.call, { op: "permuta", cmd: { type: "music", ...cmd } });

  return (
    <>
      <div className="backdrop" style={m?.art ? { backgroundImage: `url("${m.art}")` } : undefined} />
      <div className="stage standby" onClick={() => setOpen(true)}>
        <div className="top">
          {first && (
            <div className="pill"><span className="dot" style={{ color: first.color ?? "#b48cff", background: first.color ?? "#b48cff" }} /><span className="fit">{first.title}</span><b>{until(first, tick)}</b></div>
          )}
        </div>
        <div className="left">
          {widgets.includes("clock") && <div>
            <div className="clock">{time}{!scr?.screen?.hours24 && <small>{d.getHours() >= 12 ? "PM" : "AM"}</small>}</div>
            <div className="date">{d.toLocaleDateString([], { weekday: "long" })} · {d.toLocaleDateString([], { month: "long", day: "numeric" })}{away ? " · away" : ""}</div>
          </div>}
          {widgets.includes("weather") && <Weather w={scr?.weather ?? null} />}
        </div>
        <div className="right">
          {widgets.includes("music") && m && m.track && <NowPlaying m={m} now={tick} onControl={sendMusic} />}
        </div>
        {widgets.includes("agenda") && <div className="strip"><div className="cap">Next up</div><div className="strip-row">{upcoming.slice(0, 5).map((e, i) => (
          <div key={i} className="chipcard"><span className="dot" style={{ color: e.color ?? "#7c8cff", background: e.color ?? "#7c8cff" }} /><div style={{ minWidth: 0 }}><div className="clamp1 midsm">{e.title}</div><div className="small">{when(e, tick)}</div></div></div>))}
          {upcoming.length === 0 && <div className="small">Nothing coming up</div>}</div></div>}
      </div>
      {open && <Controls home={home} call={api.call} reload={async () => { try { const r = await api.call("/api/home"); if (r.ok) setHome(await r.json()); } catch {} }} hide={scr?.screen?.hideRooms ?? []} close={() => setOpen(false)} music={scr?.music ?? null} />}
    </>
  );
}

function until(e: Ev, now: number) {
  const mins = Math.round((e.start * 1000 - now) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `in ${h}h ${mins % 60}m` : `in ${Math.floor(h / 24)}d`;
}
function when(e: Ev, now: number) {
  const day = (t: number) => { const a = new Date(t), n = new Date(now); const diff = Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) / 864e5); return diff <= 0 ? "Today" : diff === 1 ? "Tomorrow" : a.toLocaleDateString([], { weekday: "long" }); };
  const tm = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return e.allDay ? `${day(e.start * 1000)} · all day` : `${day(e.start * 1000)} ${tm(e.start * 1000)} – ${tm(e.end * 1000)}`;
}

function PinPad({ unlock }: { unlock: (p: string) => Promise<boolean> }) {
  const [v, setV] = useState(""); const [bad, setBad] = useState(false); const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = useCallback(async (pin: string) => {
    busyRef.current = true; setBusy(true);
    const ok = await unlock(pin);
    if (!ok) { setBad(true); setTimeout(() => { setV(""); setBad(false); busyRef.current = false; setBusy(false); }, 700); }
    // on success the page replaces this screen
  }, [unlock]);

  const press = useCallback((d: string) => {
    if (busyRef.current) return;
    setBad(false);
    setV((cur) => {
      const next = (cur + d).slice(0, 4);
      if (next.length === 4) setTimeout(() => submit(next), 120);   // four digits: send it
      return next;
    });
  }, [submit]);

  // a real or remote keyboard works too
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setV((c) => (busyRef.current ? c : c.slice(0, -1)));
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [press]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", ""];
  return (
    <div className="pin">
      <div className="cap">Enter the PIN</div>
      <div className={`dots ${bad ? "bad" : ""}`}>{[0, 1, 2, 3].map((i) => <i key={i} className={i < v.length ? "on" : ""} />)}</div>
      <div className="keypad">
        {keys.map((k, i) => k === "" ? <span key={i} /> :
          <button key={i} autoFocus={k === "5"} disabled={busy && k !== "⌫"} onClick={() => k === "⌫" ? (!busyRef.current && setV((c) => c.slice(0, -1))) : press(k)}>{k}</button>)}
      </div>
      <div className="small" style={{ opacity: bad ? 1 : 0, color: "#ff8a8a" }}>That PIN didn&apos;t work</div>
    </div>
  );
}

function Weather({ w }: { w: Screen["weather"] }) {
  if (!w?.current) return null;
  const code = w.current.weather_code, night = w.current.is_day === 0;
  const icon = code === 0 ? (night ? "🌙" : "☀️") : code <= 2 ? (night ? "☁️" : "⛅") : code === 3 ? "☁️" : code >= 95 ? "⛈" : code >= 71 && code <= 77 ? "❄️" : code >= 45 && code <= 48 ? "🌫" : "🌧";
  const hi = w.daily?.temperature_2m_max[0], lo = w.daily?.temperature_2m_min[0];
  return (
    <div className="wx"><span style={{ fontSize: "5.6vmin" }}>{icon}</span><span className="temp">{Math.round(w.current.temperature_2m)}°</span>
      <div><div className="mid" style={{ fontWeight: 700 }}>{WMO[code] ?? ""}</div>{hi != null && lo != null && <div className="small">H {Math.round(hi)}° · L {Math.round(lo)}°</div>}</div></div>
  );
}

function NowPlaying({ m, now, onControl }: { m: Music; now: number; onControl: (c: Record<string, unknown>) => void }) {
  const pos = Math.min(m.duration, m.progress + (m.playing ? (now - m.at) / 1000 : 0));
  const fmt = (x: number) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
  const stop = (f: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); f(); };
  const vref = useRef<HTMLDivElement>(null);
  const setVol = (e: React.PointerEvent, final: boolean) => { const r = vref.current!.getBoundingClientRect(); const v = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)); if (final) onControl({ action: "volume", level: v }); };
  return (
    <div className="np" onClick={(e) => e.stopPropagation()}>
      <div className="npcard">
        <div className="row" style={{ alignItems: "flex-start" }}>
          {m.art ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="art" src={m.art} alt="" /> : <div className="art" />}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="big clamp">{m.track}</div>
            <div className="mid clamp1" style={{ opacity: .6 }}>{m.artist}</div>
            <div className="row" style={{ gap: "2.4vmin", marginTop: "1.6vmin" }}>
              <button className="ctl" onClick={stop(() => onControl({ action: "previous" }))}>⏮</button>
              <button className="ctl main" onClick={stop(() => onControl({ action: m.playing ? "pause" : "play" }))}>{m.playing ? "⏸" : "▶︎"}</button>
              <button className="ctl" onClick={stop(() => onControl({ action: "next" }))}>⏭</button>
            </div>
          </div>
        </div>
        <div className="cap" style={{ margin: "1.6vmin 0 .6vmin" }}>{m.playing ? "Now playing" : "Paused"}{m.device ? ` · ${m.device}` : ""}</div>
        <div className="bar"><i style={{ width: `${m.duration ? (pos / m.duration) * 100 : 0}%` }} /></div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: ".6vmin" }}><span className="small">{fmt(pos)}</span><span className="small">{fmt(m.duration)}</span></div>
      </div>
      {m.volume != null && <div ref={vref} className="vol" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setVol(e, false); }} onPointerUp={(e) => setVol(e, true)}><i style={{ height: `${m.volume * 100}%` }} /></div>}
    </div>
  );
}

// ---------- the touch controller ----------

type Call = (path: string, init?: RequestInit) => Promise<Response>;
const post = (call: Call, body: Record<string, unknown>) => call("/api/act", { method: "POST", body: JSON.stringify(body) }).catch(() => null);

function Level({ icon, label, value, onChange, onIcon }: { icon?: string; label: string; value: number; onChange: (v: number, final: boolean) => void; onIcon?: () => void }) {
  const ref = useRef<HTMLDivElement>(null); const [drag, setDrag] = useState<number | null>(null);
  const at = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  const shown = drag ?? value;
  return (
    <div className="row">
      {icon && <button onClick={onIcon} style={{ fontSize: "3.2vmin", width: "5vmin", opacity: shown > 0 ? 1 : .4 }}>{icon}</button>}
      <div ref={ref} className="level" style={{ flex: 1 }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const v = at(e); setDrag(v); onChange(v, false); }}
        onPointerMove={(e) => { if (drag !== null) { const v = at(e); setDrag(v); onChange(v, false); } }}
        onPointerUp={(e) => { const v = at(e); setDrag(null); onChange(v, true); }}>
        <i style={{ width: `${shown * 100}%` }} /><span><b>{label}</b><b>{Math.round(shown * 100)}%</b></span>
      </div>
    </div>
  );
}

function Controls({ home, call, reload, hide, close, music }: { home: Home | null; call: Call; reload: () => void; hide: string[]; close: () => void; music: Music | null }) {
  const [tab, setTab] = useState<"lights" | "fans" | "speakers" | "scenes">("lights");
  const last = useRef(0);
  const throttled = (fn: () => void, final: boolean) => { const n = Date.now(); if (final || n - last.current > 180) { last.current = n; fn(); } };
  const devices = home?.devices ?? [];
  const lights = devices.filter((d) => d.kind === "light" || d.kind === "plug");
  const rooms = (home?.rooms ?? []).filter((r) => !hide.includes(r));
  const send = async (b: Record<string, unknown>) => { await post(call, b); setTimeout(reload, 350); };
  const anyOn = lights.some((l) => l.on);

  return (
    <div className="sheet">
      <div className="tabs">
        {(["lights", "fans", "speakers", "scenes"] as const).map((t) => <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
        <span style={{ flex: 1 }} />
        {!home?.reachable && <span className="small">Home Assistant isn&apos;t answering</span>}
        <button className="tab" onClick={close}>Done</button>
      </div>

      {tab === "lights" && <>
        <div className="tile" style={{ marginBottom: "1.6vmin" }}>
          <Level icon={anyOn ? "💡" : "○"} label={`All lights · ${lights.filter((l) => l.on).length} on`} value={lights.filter((l) => l.on && l.brightness != null).reduce((s, l, _, a) => s + (l.brightness ?? 1) / a.length, 0) || (anyOn ? 1 : 0)}
            onIcon={() => send({ op: "many", ids: lights.filter((l) => !(anyOn && /\bled\b/i.test(l.name))).map((l) => l.id), on: !anyOn })}
            onChange={(v, f) => throttled(() => post(call, { op: "brightness", ids: lights.filter((l) => l.dimmable).map((l) => l.id), pct: Math.max(1, v * 100) }), f)} />
        </div>
        {rooms.map((room) => (
          <div key={room} style={{ marginBottom: "2.4vmin" }}>
            <div className="row" style={{ marginBottom: "1vmin" }}><div className="cap">{room}</div><button className="chip" onClick={() => send({ op: "many", ids: lights.filter((l) => l.room === room).map((l) => l.id), on: !lights.some((l) => l.room === room && l.on) })}>{lights.some((l) => l.room === room && l.on) ? "Turn off" : "Turn on"}</button></div>
            <div className="grid">{lights.filter((l) => l.room === room).map((l) => <LightTile key={l.id} l={l} send={send} throttled={throttled} call={call} />)}</div>
          </div>))}
      </>}

      {tab === "fans" && <div className="grid">{devices.filter((d) => d.kind === "fan").map((f) => <FanTile key={f.id} f={f} send={send} />)}</div>}

      {tab === "speakers" && <div className="grid">{devices.filter((d) => d.kind === "media").map((s) => (
        <div key={s.id} className="tile">
          <div className="row"><div style={{ minWidth: 0, flex: 1 }}><div className="mid fit">{s.name}</div><div className="small fit">{[s.title, s.artist].filter(Boolean).join(" · ") || (s.on ? "Idle" : "Off")}</div></div></div>
          <div className="steps">
            <button onClick={() => send({ op: "media", id: s.id, action: "previous" })}>⏮</button>
            <button className={s.playing ? "on" : ""} onClick={() => send({ op: "media", id: s.id, action: s.playing ? "pause" : "play" })}>{s.playing ? "⏸" : "▶︎"}</button>
            <button onClick={() => send({ op: "media", id: s.id, action: "next" })}>⏭</button>
          </div>
          {s.volume != null && <Level label="Volume" value={s.volume} onChange={(v, f) => throttled(() => post(call, { op: "volume", id: s.id, level: v }), f)} />}
        </div>))}
        {music && <div className="tile"><div className="cap">Spotify (through Permuta)</div><div className="steps">
          <button onClick={() => send({ op: "permuta", cmd: { type: "music", action: "previous" } })}>⏮</button>
          <button onClick={() => send({ op: "permuta", cmd: { type: "music", action: music.playing ? "pause" : "play" } })}>{music.playing ? "⏸" : "▶︎"}</button>
          <button onClick={() => send({ op: "permuta", cmd: { type: "music", action: "next" } })}>⏭</button></div></div>}
      </div>}

      {tab === "scenes" && <div className="grid">
        {[["night", "🌙 It's the night"], ["leaving", "🚶 I'm leaving"], ["returning", "🏠 I'm back"]].map(([n, l]) => <button key={n} className="tile mid" style={{ alignItems: "flex-start" }} onClick={() => send({ op: "scene", name: n })}>{l}</button>)}
        <button className={`tile mid ${home?.musicLights ? "lit" : ""}`} style={{ alignItems: "flex-start" }} onClick={() => send({ op: "musicLights", on: !home?.musicLights })}>🎵 Music lights · {home?.musicLights ? "on" : "off"}</button>
      </div>}
    </div>
  );
}

function LightTile({ l, send, throttled, call }: { l: Device; send: (b: Record<string, unknown>) => void; throttled: (fn: () => void, final: boolean) => void; call: Call }) {
  return (
    <div className={`tile ${l.on ? "lit" : ""}`}>
      <button className="row" onClick={() => send({ op: "toggle", id: l.id, on: !l.on })}><span style={{ fontSize: "3vmin" }}>{l.on ? "💡" : "○"}</span><span className="mid fit">{l.name}</span></button>
      {l.dimmable && <Level label="Brightness" value={l.on ? l.brightness ?? 1 : 0} onChange={(v, f) => throttled(() => post(call, { op: "brightness", ids: [l.id], pct: Math.max(1, v * 100) }), f)} />}
      {l.on && l.kelvinRange && <Warmth l={l} throttled={throttled} call={call} />}
    </div>
  );
}

function Warmth({ l, throttled, call }: { l: Device; throttled: (fn: () => void, final: boolean) => void; call: Call }) {
  const ref = useRef<HTMLDivElement>(null); const [lo, hi] = l.kelvinRange!;
  const pos = ((l.kelvin ?? (lo + hi) / 2) - lo) / (hi - lo);
  const set = (e: React.PointerEvent, final: boolean) => { const r = ref.current!.getBoundingClientRect(); const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); throttled(() => post(call, { op: "kelvin", id: l.id, k: lo + x * (hi - lo) }), final); };
  return (
    <div ref={ref} className="warm" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e, false); }} onPointerMove={(e) => { if (e.buttons) set(e, false); }} onPointerUp={(e) => set(e, true)}>
      <span style={{ position: "absolute", left: `calc(${pos * 100}% - 1.6vmin)`, top: 0, width: "3.2vmin", height: "3.2vmin", borderRadius: "50%", background: "#fff", boxShadow: "0 0 6px rgba(0,0,0,.5)" }} />
    </div>
  );
}

function FanTile({ f, send }: { f: Device; send: (b: Record<string, unknown>) => void }) {
  const n = f.speedCount ?? 0; const step = Math.round((f.on ? (f.percentage ?? 1) : 0) * Math.max(1, n));
  const name = (i: number) => i === 0 ? "Off" : n === 3 ? ["Low", "Medium", "High"][i - 1] : n === 2 ? (i === 1 ? "Low" : "High") : n === 1 ? "On" : `${i}`;
  return (
    <div className={`tile ${f.on ? "lit" : ""}`}>
      <div className="mid fit">🌀 {f.name}</div>
      {f.percentage != null && <div className="steps">{Array.from({ length: Math.max(1, n) + 1 }, (_, i) => <button key={i} className={i === step ? "on" : ""} onClick={() => send({ op: "fan", id: f.id, pct: (i / Math.max(1, n)) * 100 })}>{name(i)}</button>)}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        {f.oscillating != null && <button className={`chip ${f.oscillating ? "on" : ""}`} onClick={() => send({ op: "oscillate", id: f.id, on: !f.oscillating })}>Oscillate</button>}
        {f.direction != null && <button className={`chip ${f.direction === "reverse" ? "on" : ""}`} onClick={() => send({ op: "direction", id: f.id, name: f.direction === "reverse" ? "forward" : "reverse" })}>Reverse</button>}
        {(f.presets ?? []).map((p) => <button key={p} className={`chip ${f.preset === p ? "on" : ""}`} onClick={() => send({ op: "preset", id: f.id, name: p })}>{p}</button>)}
        {f.percentage == null && <button className={`chip ${f.on ? "on" : ""}`} onClick={() => send({ op: "toggle", id: f.id, on: !f.on })}>{f.on ? "On" : "Off"}</button>}
      </div>
    </div>
  );
}
