"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Device, Home } from "@/lib/ha";

type Ev = { title: string; start: number; end: number; allDay?: boolean; color?: string };
type Music = { playing: boolean; track: string; artist: string; album?: string; art?: string; progress: number; duration: number; at: number; device?: string };
type Screen = {
  screen: { widgets?: string[]; accent?: string; name?: string; hideRooms?: string[]; hours24?: boolean } | null;
  agenda: { events: Ev[] } | null; music: Music | null; status: { away?: boolean; at?: number } | null;
  weather: { current?: { temperature_2m: number; weather_code: number }; daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[] } } | null;
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

  return (
    <>
      <div className="stage" style={{ gridTemplateColumns: "1.15fr 1fr", gridTemplateRows: "1fr auto" }} onClick={() => setOpen(true)}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "2vmin", minWidth: 0 }}>
          {widgets.includes("clock") && <div><div className="clock">{time}</div><div className="date">{d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}{away ? " · away" : ""}</div></div>}
          {widgets.includes("weather") && <Weather w={scr?.weather ?? null} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2vmin", minHeight: 0 }}>
          {widgets.includes("music") && <NowPlaying m={scr?.music ?? null} now={tick} />}
          {widgets.includes("agenda") && <Agenda events={scr?.agenda?.events ?? []} now={tick} />}
        </div>
        <div className="hint" style={{ gridColumn: "1 / -1", position: "static" }}>Tap anywhere for controls</div>
      </div>
      {open && <Controls home={home} call={api.call} reload={async () => { try { const r = await api.call("/api/home"); if (r.ok) setHome(await r.json()); } catch {} }} hide={scr?.screen?.hideRooms ?? []} close={() => setOpen(false)} music={scr?.music ?? null} />}
    </>
  );
}

function PinPad({ unlock }: { unlock: (p: string) => Promise<boolean> }) {
  const [v, setV] = useState(""); const [bad, setBad] = useState(false);
  return (
    <div className="pin">
      <div className="cap">Enter the PIN</div>
      <input value={v} inputMode="numeric" type="password" autoFocus onChange={(e) => { setV(e.target.value); setBad(false); }} onKeyDown={async (e) => { if (e.key === "Enter") setBad(!(await unlock(v))); }} />
      <div className="small" style={{ opacity: bad ? 1 : 0, color: "#ff8a8a" }}>That PIN didn&apos;t work</div>
    </div>
  );
}

function Weather({ w }: { w: Screen["weather"] }) {
  if (!w?.current) return null;
  const dd = w.daily;
  return (
    <div className="card">
      <div className="row"><div className="clock" style={{ fontSize: "9vmin" }}>{Math.round(w.current.temperature_2m)}°</div><div className="mid">{WMO[w.current.weather_code] ?? ""}</div></div>
      {dd && <div className="row" style={{ marginTop: "1.6vmin", justifyContent: "space-between" }}>{dd.time.slice(1, 5).map((t, i) => (
        <div key={t} style={{ textAlign: "center" }}><div className="cap">{new Date(t + "T12:00").toLocaleDateString([], { weekday: "short" })}</div><div className="mid">{Math.round(dd.temperature_2m_max[i + 1])}°</div><div className="small">{Math.round(dd.temperature_2m_min[i + 1])}°</div></div>))}</div>}
    </div>
  );
}

function Agenda({ events, now }: { events: Ev[]; now: number }) {
  const upcoming = events.filter((e) => e.end * 1000 > now).slice(0, 5);
  return (
    <div className="card" style={{ flex: 1 }}>
      <div className="cap" style={{ marginBottom: "1.4vmin" }}>Up next</div>
      {upcoming.length === 0 && <div className="small">Nothing coming up</div>}
      {upcoming.map((e, i) => (
        <div key={i} className="row" style={{ marginBottom: "1.4vmin" }}>
          <span className="dot" style={{ color: e.color ?? "#7c8cff", background: e.color ?? "#7c8cff" }} />
          <div style={{ minWidth: 0 }}><div className="mid fit">{e.title}</div><div className="small">{e.allDay ? "All day" : new Date(e.start * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div></div>
        </div>))}
    </div>
  );
}

function NowPlaying({ m, now }: { m: Music | null; now: number }) {
  if (!m || !m.track) return null;
  const pos = Math.min(m.duration, m.progress + (m.playing ? (now - m.at) / 1000 : 0));
  return (
    <div className="card">
      <div className="row">
        {m.art ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="art" src={m.art} alt="" /> : <div className="art" />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="cap">{m.playing ? "Now playing" : "Paused"}{m.device ? ` · ${m.device}` : ""}</div>
          <div className="big fit" style={{ marginTop: ".6vmin" }}>{m.track}</div>
          <div className="mid fit" style={{ opacity: .6 }}>{m.artist}</div>
          <div className="bar" style={{ marginTop: "1.6vmin" }}><i style={{ width: `${m.duration ? (pos / m.duration) * 100 : 0}%` }} /></div>
        </div>
      </div>
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
