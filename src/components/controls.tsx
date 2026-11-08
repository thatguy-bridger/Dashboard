"use client";
import { useRef, useState } from "react";
import type { Device, Home } from "@/lib/ha";
import { post, type Call } from "@/lib/useApi";
import { Icon, type IconName } from "./Icon";
import type { Music } from "@/lib/types";

// ---------- the touch controller ----------


function Level({ icon, label, value, onChange, onIcon }: { icon?: IconName; label: string; value: number; onChange: (v: number, final: boolean) => void; onIcon?: () => void }) {
  const ref = useRef<HTMLDivElement>(null); const [drag, setDrag] = useState<number | null>(null);
  const at = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  const shown = drag ?? value;
  return (
    <div className="row">
      {icon && <button onClick={onIcon} style={{ fontSize: "3.2vmin", width: "5vmin", opacity: shown > 0 ? 1 : .4 }} aria-label="Toggle"><Icon name={icon} /></button>}
      <div ref={ref} className="level" style={{ flex: 1 }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const v = at(e); setDrag(v); onChange(v, false); }}
        onPointerMove={(e) => { if (drag !== null) { const v = at(e); setDrag(v); onChange(v, false); } }}
        onPointerUp={(e) => { const v = at(e); setDrag(null); onChange(v, true); }}>
        <i style={{ width: `${shown * 100}%` }} /><span><b>{label}</b><b>{Math.round(shown * 100)}%</b></span>
      </div>
    </div>
  );
}

export function Controls({ home, call, reload, hide, close, music }: { home: Home | null; call: Call; reload: () => void; hide: string[]; close: () => void; music: Music | null }) {
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
          <Level icon="bulb" label={`All lights · ${lights.filter((l) => l.on).length} on`} value={lights.filter((l) => l.on && l.brightness != null).reduce((s, l, _, a) => s + (l.brightness ?? 1) / a.length, 0) || (anyOn ? 1 : 0)}
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
            <button onClick={() => send({ op: "media", id: s.id, action: "previous" })}><Icon name="skip-back" /></button>
            <button className={s.playing ? "on" : ""} onClick={() => send({ op: "media", id: s.id, action: s.playing ? "pause" : "play" })}><Icon name={s.playing ? "pause" : "play"} /></button>
            <button onClick={() => send({ op: "media", id: s.id, action: "next" })}><Icon name="skip-forward" /></button>
          </div>
          {s.volume != null && <Level label="Volume" value={s.volume} onChange={(v, f) => throttled(() => post(call, { op: "volume", id: s.id, level: v }), f)} />}
        </div>))}
        {music && <div className="tile"><div className="cap">Spotify (through Permuta)</div><div className="steps">
          <button onClick={() => send({ op: "permuta", cmd: { type: "music", action: "previous" } })}><Icon name="skip-back" /></button>
          <button onClick={() => send({ op: "permuta", cmd: { type: "music", action: music.playing ? "pause" : "play" } })}><Icon name={music.playing ? "pause" : "play"} /></button>
          <button onClick={() => send({ op: "permuta", cmd: { type: "music", action: "next" } })}><Icon name="skip-forward" /></button></div></div>}
      </div>}

      {tab === "scenes" && <div className="grid">
        {([["night", "It's the night", "moon"], ["leaving", "I'm leaving", "walk"], ["returning", "I'm back", "home"]] as [string, string, IconName][]).map(([n, l, ic]) => <button key={n} className="tile mid row" onClick={() => send({ op: "scene", name: n })}><Icon name={ic} />{l}</button>)}
        <button className={`tile mid row ${home?.musicLights ? "lit" : ""}`} onClick={() => send({ op: "musicLights", on: !home?.musicLights })}><Icon name="note" />Music lights · {home?.musicLights ? "on" : "off"}</button>
      </div>}
    </div>
  );
}

function LightTile({ l, send, throttled, call }: { l: Device; send: (b: Record<string, unknown>) => void; throttled: (fn: () => void, final: boolean) => void; call: Call }) {
  return (
    <div className={`tile ${l.on ? "lit" : ""}`}>
      <button className="row" onClick={() => send({ op: "toggle", id: l.id, on: !l.on })}><Icon name="bulb" size="3vmin" className={l.on ? "ic-on" : "ic-off"} /><span className="mid fit">{l.name}</span></button>
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
      <div className="mid fit row"><Icon name="fan" />{f.name}</div>
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
