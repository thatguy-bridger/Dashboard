"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Device, Home } from "@/lib/ha";
import { hsToHex, hsToPicker, pickerToHs, SWATCHES, tintFor } from "@/lib/color";
import { placePopover, type Rect } from "@/lib/popover";
import { dragValue, tileReduce, TILE_IDLE, type TileState } from "@/lib/tile";
import { post, type Call } from "@/lib/useApi";
import type { SceneProps } from "@/scenes/types";
import { Icon, type IconName } from "./Icon";
import { GlassGroup } from "./glass";
import { cancelPlan, liveTimers, startTimers, timerOf, TIMER_CHOICES, type Timers } from "@/lib/timer";
import { fmtClock, fmtTime } from "@/lib/format";

// The Home page: a normal page in the same frame (rail, header, tokens, motion). Scenes on top, then rooms as quiet sections of tiles.
// A tile: TAP toggles, DRAG across it sets the level (the fill follows the finger), HOLD opens that device's detail popover. All of it is optimistic.

type Act = (body: Record<string, unknown>, final?: boolean) => void;
function useAct(call: Call, reload: () => void): Act {
  const last = useRef(0), pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((body, final = true) => {                                  // drags are throttled to about 5 requests a second; the last value always goes out
    const send = () => { last.current = Date.now(); post(call, body); if (final) setTimeout(reload, 450); };
    if (pending.current) { clearTimeout(pending.current); pending.current = null; }
    if (final || Date.now() - last.current > 190) send(); else pending.current = setTimeout(send, 190);
  }, [call, reload]);
}

// "Switch off after": the timer itself runs in Home Assistant; this page remembers what it started so a tile can show when the light goes off.
type TimerApi = { live: Timers; now: number; set: (ids: string[], minutes: number, on: boolean) => void; cancel: (ids: string[]) => void };
const TIMER_KEY = "dash-timers";
function useTimers(call: Call, now: number): TimerApi {
  const [t, setT] = useState<Timers>(() => { try { return JSON.parse(localStorage.getItem(TIMER_KEY) ?? "{}") as Timers; } catch { return {}; } });
  const ref = useRef(t); ref.current = t;
  useEffect(() => { try { localStorage.setItem(TIMER_KEY, JSON.stringify(liveTimers(t, Date.now()))); } catch {} }, [t]);
  const set = useCallback((ids: string[], minutes: number, on: boolean) => {
    const before = ref.current; setT(startTimers(before, ids, minutes, on, Date.now()));                       // shown at once
    post(call, { op: "timer", ids, minutes, on }).then((r) => { if (!r || !r.ok) setT((cur) => { const n = { ...cur }; for (const id of ids) { if (before[id]) n[id] = before[id]; else delete n[id]; } return n; }); });
  }, [call]);
  const cancel = useCallback((ids: string[]) => {
    const plan = cancelPlan(ref.current, ids, Date.now()); setT(plan.timers);
    post(call, { op: "cancelTimers" }).then(() => { for (const r of plan.rearm) post(call, { op: "timer", id: r.id, minutes: r.minutes, on: r.on }); });     // cancelling stops all of them in Home Assistant: the others start again
  }, [call]);
  return { live: liveTimers(t, now), now, set, cancel };
}
const rectOf = (el: Element): Rect => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

type TileProps = { icon: IconName; title: string; sub?: string; lit?: boolean; tint?: string; level?: number; badge?: string; onTap?: () => void; onLevel?: (v: number, final: boolean) => void; onHold?: (anchor: Rect) => void; className?: string };
function Tile({ icon, title, sub, lit, tint, level, badge, onTap, onLevel, onHold, className = "" }: TileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef<TileState>(TILE_IDLE), startLevel = useRef(0), lastLevel = useRef<number | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [local, setLocal] = useState<number | null>(null), [pressing, setPressing] = useState(false), [flash, setFlash] = useState(false);
  const draggable = !!onLevel && level != null;
  const cb = useRef({ onTap, onLevel, onHold, level, draggable }); cb.current = { onTap, onLevel, onHold, level, draggable };
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const feed = (type: "down" | "move" | "up" | "tick", x = 0, y = 0) => {
    const r = tileReduce(st.current, { type, x, y, t: performance.now() }, { dragSlop: cb.current.draggable ? 12 : 100000 });          // a tile with no level never starts a drag
    st.current = r.state; return r.action;
  };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button > 0) return;
    try { ref.current?.setPointerCapture(e.pointerId); } catch {}                                        // some pointers can't be captured: carry on without
    setPressing(true); lastLevel.current = null; startLevel.current = cb.current.level ?? 0;
    feed("down", e.clientX, e.clientY);
    clear();
    timer.current = setTimeout(() => {                                                                      // the hold: a tiny scale flash, then the popover; releasing afterwards does not tap
      if (feed("tick") === "hold" && ref.current && cb.current.onHold) { setFlash(true); setTimeout(() => setFlash(false), 280); cb.current.onHold(rectOf(ref.current)); }
    }, 400);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = feed("move", e.clientX, e.clientY);
    if (a === "dragstart" || a === "drag") { clear(); const v = dragValue(startLevel.current, st.current.x0, e.clientX, ref.current?.clientWidth ?? 200); lastLevel.current = v; setLocal(v); cb.current.onLevel?.(v, false); }
    else if (st.current.phase === "idle") { clear(); setPressing(false); }                                // it was a scroll: step aside
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    clear(); setPressing(false);
    const a = feed("up", e.clientX, e.clientY);
    if (a === "tap") cb.current.onTap?.();
    if (a === "dragend" && lastLevel.current != null) cb.current.onLevel?.(lastLevel.current, true);
    setLocal(null);
  };
  const cancel = () => { clear(); st.current = TILE_IDLE; setPressing(false); setLocal(null); };
  useEffect(() => () => clear(), []);
  const shown = local ?? level ?? 0;
  return (
    <div ref={ref} className={`htile ${lit ? "lit" : ""} ${pressing ? "pressing" : ""} ${flash ? "flash" : ""} ${local != null ? "dragging" : ""} ${className}`} style={{ ["--tint" as string]: tint ?? "var(--accent)" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onTap?.(); }}>
      {draggable && (lit || local != null) && <div className="hfill" style={{ width: `${Math.round(shown * 100)}%` }} />}
      <Icon name={icon} className="hicon" />
      {badge && <span className="hbadge" aria-label={`Timer, ${badge}`}><Icon name="timer" />{badge}</span>}
      <div className="htext"><div className="htitle fit">{title}</div>{sub && <div className="hsub fit">{sub}</div>}</div>
    </div>
  );
}

// ---------- device mapping ----------
const SPEEDS = (n: number) => ["Off", ...(n === 3 ? ["Low", "Medium", "High"] : n === 2 ? ["Low", "High"] : n === 1 ? ["On"] : Array.from({ length: n }, (_, i) => `${i + 1}`))];
const stepOf = (d: Device) => Math.round((d.on ? d.percentage ?? 1 : 0) * Math.max(1, d.speedCount ?? 1));
function describe(d: Device): { icon: IconName; sub: string; lit: boolean; level?: number } {
  if (d.kind === "fan") return { icon: "fan", lit: d.on, sub: d.on ? (d.speedCount ? SPEEDS(d.speedCount)[stepOf(d)] ?? "On" : "On") : "Off", level: d.percentage != null ? (d.on ? d.percentage : 0) : undefined };
  if (d.kind === "media") return { icon: "speaker", lit: d.on && !!d.playing, sub: d.playing ? ([d.title, d.artist].filter(Boolean).join(" · ") || "Playing") : d.on ? "Idle" : "Off", level: d.volume };
  const pct = Math.round((d.brightness ?? 1) * 100);
  return { icon: "bulb", lit: d.on, sub: d.on ? (d.dimmable ? `On · ${pct}%` : "On") : "Off", level: d.dimmable ? (d.on ? d.brightness ?? 1 : 0) : undefined };
}

type Pop = { kind: "device"; id: string; anchor: Rect } | { kind: "room"; room: string; anchor: Rect } | { kind: "all"; anchor: Rect };

export function HomePage(p: SceneProps) {
  const { home, call, reloadHome } = p;
  const act = useAct(call, reloadHome);
  const tm = useTimers(call, p.now);
  const [pop, setPop] = useState<Pop | null>(null);
  const devices = useMemo(() => (home?.devices ?? []).filter((d) => d.kind !== "display"), [home]);
  const lights = devices.filter((d) => d.kind === "light" || d.kind === "plug");
  const roomNames = useMemo(() => { const seen: string[] = []; for (const r of [...(home?.rooms ?? []), ...devices.map((d) => d.room)]) if (r && !seen.includes(r) && !p.hideRooms.includes(r)) seen.push(r); return seen; }, [home, devices, p.hideRooms]);
  const anyOn = lights.some((l) => l.on), away = !!home?.away;
  const avg = lights.filter((l) => l.on && l.dimmable).reduce((s, l, _, a) => s + (l.brightness ?? 1) / a.length, 0) || (anyOn ? 1 : 0);
  const stays = (l: Device) => /\bled\b/i.test(l.name);

  if (!home?.configured) return <div className="sc home"><div className="card"><div className="cap">Home</div><div className="mid">Home control isn&apos;t set up yet.</div></div></div>;
  return (
    <div className="sc home" onClick={(e) => e.stopPropagation()}>
      <div className="hscroll">
        <section className="hscenes">
          <Tile className="hbig" icon="moon" title="Night" sub="Lights off, speakers low" onTap={() => act({ op: "scene", name: "night" })} />
          <Tile className="hbig" icon={away ? "home" : "walk"} title={away ? "I'm back" : "I'm leaving"} sub={away ? "Welcome home" : "Everything off"} lit={away} onTap={() => act({ op: "scene", name: away ? "returning" : "leaving" })} />
          <Tile className="hbig" icon="note" title="Music lights" sub={home.musicLights ? "On" : "Off"} lit={home.musicLights} onTap={() => act({ op: "musicLights", on: !home.musicLights })} />
          <Tile className="hbig hmaster" icon="bulb" title="All lights" sub={`${lights.filter((l) => l.on).length} of ${lights.length} on`} lit={anyOn} level={lights.some((l) => l.dimmable) ? avg : undefined}
            onTap={() => act({ op: "many", ids: lights.filter((l) => !(anyOn && stays(l))).map((l) => l.id), on: !anyOn })}
            onLevel={(v, f) => act({ op: "brightness", ids: lights.filter((l) => l.dimmable).map((l) => l.id), pct: Math.max(1, v * 100) }, f)}
            onHold={(anchor) => setPop({ kind: "all", anchor })} />
        </section>
        {roomNames.map((room) => {
          const ds = devices.filter((d) => d.room === room), ls = ds.filter((d) => d.kind === "light" || d.kind === "plug"), on = ls.filter((l) => l.on).length;
          return (
            <section key={room} className="hroom">
              <RoomHeader name={room} sub={ls.length ? `${on} of ${ls.length} on` : `${ds.length} device${ds.length === 1 ? "" : "s"}`} canHold={ls.length > 0}
                onToggle={ls.length ? () => act({ op: "many", ids: ls.map((l) => l.id), on: on === 0 }) : undefined} toggleLabel={on === 0 ? "Turn on" : "Turn off"} onHold={(anchor) => setPop({ kind: "room", room, anchor })} />
              <div className="htiles">
                {ds.map((d) => {
                  const x = describe(d);
                  return <Tile key={d.id} icon={x.icon} title={d.name} sub={x.sub} lit={x.lit} badge={badgeOf(tm, [d.id])} tint={d.kind === "light" ? tintFor(d) : undefined} level={x.level}
                    onTap={() => d.kind === "media" ? act({ op: "media", id: d.id, action: d.playing ? "pause" : "play" }) : act({ op: "toggle", id: d.id, on: !d.on })}
                    onLevel={x.level == null ? undefined : (v, f) => d.kind === "fan" ? act({ op: "fan", id: d.id, pct: Math.round((d.speedCount ? Math.round(v * d.speedCount) / d.speedCount : v) * 100) }, f) : d.kind === "media" ? act({ op: "volume", id: d.id, level: v }, f) : act({ op: "brightness", ids: [d.id], pct: Math.max(1, v * 100) }, f)}
                    onHold={(anchor) => setPop({ kind: "device", id: d.id, anchor })} />;
                })}
              </div>
            </section>
          );
        })}
        {!roomNames.length && <div className="card"><div className="small">No devices found. Home Assistant may not be answering.</div></div>}
      </div>
      {pop && <Popover anchor={pop.anchor} onClose={() => setPop(null)}>
        {pop.kind === "device" && <DevicePanel id={pop.id} devices={devices} act={act} tm={tm} />}
        {pop.kind === "room" && <LightsPanel title={pop.room} lights={devices.filter((d) => d.room === pop.room && (d.kind === "light" || d.kind === "plug"))} act={act} tm={tm} />}
        {pop.kind === "all" && <LightsPanel title="All lights" lights={lights} act={act} tm={tm} />}
      </Popover>}
    </div>
  );
}

function RoomHeader({ name, sub, onToggle, toggleLabel, onHold, canHold }: { name: string; sub: string; onToggle?: () => void; toggleLabel: string; onHold: (a: Rect) => void; canHold: boolean }) {
  const ref = useRef<HTMLDivElement>(null), t = useRef<ReturnType<typeof setTimeout> | null>(null), held = useRef(false);
  return (
    <div ref={ref} className="hroom-h" onPointerDown={() => { held.current = false; if (canHold) t.current = setTimeout(() => { held.current = true; if (ref.current) onHold(rectOf(ref.current)); }, 450); }}
      onPointerUp={() => { if (t.current) clearTimeout(t.current); }} onPointerLeave={() => { if (t.current) clearTimeout(t.current); }} onContextMenu={(e) => e.preventDefault()}>
      <div className="cap">{name}</div><div className="small">{sub}</div><span style={{ flex: 1 }} />
      {onToggle && <button className="chip" onPointerDown={(e) => e.stopPropagation()} onClick={() => { if (!held.current) onToggle(); }}>{toggleLabel}</button>}
    </div>
  );
}

// ---------- the detail popover (anchored to the tile, not full-screen) ----------
function Popover({ anchor, onClose, children }: { anchor: Rect; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: anchor.x, y: anchor.y + anchor.h + 10, side: "below" as string });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const place = () => setPos(placePopover(anchor, { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight }));
    place(); const ro = new ResizeObserver(place); ro.observe(el); return () => ro.disconnect();
  }, [anchor]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="popscrim" onPointerDown={onClose}>
      <div ref={ref} className={`popover ${pos.side}`} style={{ left: pos.x, top: pos.y }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function Slider({ label, value, onChange, tone }: { label: string; value: number; onChange: (v: number, final: boolean) => void; tone?: string }) {
  const ref = useRef<HTMLDivElement>(null); const [drag, setDrag] = useState<number | null>(null);
  const at = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  const shown = drag ?? value;
  return (
    <div className="pslider"><div className="cap">{label}</div>
      <div ref={ref} className="ptrack" style={tone ? { background: tone } : undefined}
        onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} const v = at(e); setDrag(v); onChange(v, false); }}
        onPointerMove={(e) => { if (drag !== null) { const v = at(e); setDrag(v); onChange(v, false); } }}
        onPointerUp={(e) => { const v = at(e); setDrag(null); onChange(v, true); }}>
        {!tone && <i style={{ width: `${shown * 100}%` }} />}{tone && <b className="pknob" style={{ left: `calc(${shown * 100}% - 1.6 * var(--u))` }} />}
      </div>
    </div>
  );
}

function HuePicker({ hs, onChange }: { hs: [number, number]; onChange: (h: number, s: number, final: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null); const [drag, setDrag] = useState<[number, number] | null>(null);
  const to = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return pickerToHs((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
  const shown = drag ?? hs, [fx, fy] = hsToPicker(shown[0], shown[1]);
  return (
    <div ref={ref} className="hue" onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} const v = to(e); setDrag(v); onChange(v[0], v[1], false); }}
      onPointerMove={(e) => { if (drag) { const v = to(e); setDrag(v); onChange(v[0], v[1], false); } }} onPointerUp={(e) => { const v = to(e); setDrag(null); onChange(v[0], v[1], true); }}>
      <span className="huedot" style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, background: hsToHex(shown[0], shown[1]) }} />
    </div>
  );
}

/** Brightness, warmth and colour for one light or a whole room (applied to every light in it). */
function LightsPanel({ title, lights, act, tm }: { title: string; lights: Device[]; act: Act; tm: TimerApi }) {
  const ids = lights.map((l) => l.id), dim = lights.filter((l) => l.dimmable), col = lights.filter((l) => l.supportsColor);
  const warm = lights.find((l) => l.kelvinRange), range = warm?.kelvinRange ?? [2200, 6500];
  const bri = dim.filter((l) => l.on).reduce((s, l, _, a) => s + (l.brightness ?? 1) / a.length, 0);
  const k = warm?.kelvin ?? Math.round((range[0] + range[1]) / 2), hs = (col.find((l) => l.color)?.color ?? [30, 60]) as [number, number];
  return (
    <div className="ppanel" style={{ ["--tint" as string]: tintFor({ color: col.find((l) => l.color)?.color, kelvin: warm?.kelvin }) }}>
      <div className="ptitle">{title}</div>
      {dim.length > 0 && <Slider label="Brightness" value={bri} onChange={(v, f) => act({ op: "brightness", ids: dim.map((l) => l.id), pct: Math.max(1, v * 100) }, f)} />}
      {warm && <Slider label="Warmth" value={(k - range[0]) / (range[1] - range[0])} tone="linear-gradient(90deg, #ffa84d, #fff3e0, #b3d1ff)" onChange={(v, f) => act({ op: "kelvin", ids: lights.filter((l) => l.kelvinRange).map((l) => l.id), k: Math.round(range[0] + v * (range[1] - range[0])) }, f)} />}
      {col.length > 0 && (
        <div className="pcolor"><div className="cap">Colour</div>
          <div className="swatches">{SWATCHES.map((s) => <button key={s.name} className="swatch" aria-label={s.name} style={{ background: hsToHex(s.h, s.s) }} onClick={() => act({ op: "color", ids: col.map((l) => l.id), h: s.h, s: s.s })} />)}</div>
          <HuePicker hs={hs} onChange={(h, s, f) => act({ op: "color", ids: col.map((l) => l.id), h, s }, f)} />
        </div>
      )}
      {ids.length > 0 && <button className="chip wide" onClick={() => { act({ op: "kelvin", ids, k: 4000 }); }}>Reset to white</button>}
      {ids.length > 0 && <TimerBox ids={ids} anyOn={lights.some((l) => l.on)} tm={tm} />}
    </div>
  );
}

function DevicePanel({ id, devices, act, tm }: { id: string; devices: Device[]; act: Act; tm: TimerApi }) {
  const d = devices.find((x) => x.id === id); const [muted, setMuted] = useState<number | null>(null);
  if (!d) return null;
  if (d.kind === "light" || d.kind === "plug") return <LightsPanel title={d.name} lights={[d]} act={act} tm={tm} />;
  if (d.kind === "fan") {
    const n = d.speedCount ?? 0, step = stepOf(d), names = SPEEDS(Math.max(1, n));
    return (
      <div className="ppanel"><div className="ptitle">{d.name}</div>
        {d.percentage != null && <GlassGroup className="steps glass" active={Math.min(step, names.length - 1)}>{names.map((nm, i) => <button key={i} data-gi-item className={i === step ? "on" : ""} onClick={() => act({ op: "fan", id, pct: (i / Math.max(1, n)) * 100 })}>{nm}</button>)}</GlassGroup>}
        <div className="chips">
          {d.oscillating != null && <button className={`chip ${d.oscillating ? "on" : ""}`} onClick={() => act({ op: "oscillate", id, on: !d.oscillating })}>Oscillate</button>}
          {d.direction != null && <button className={`chip ${d.direction === "reverse" ? "on" : ""}`} onClick={() => act({ op: "direction", id, name: d.direction === "reverse" ? "forward" : "reverse" })}>Reverse</button>}
          {(d.presets ?? []).map((pr) => <button key={pr} className={`chip ${d.preset === pr ? "on" : ""}`} onClick={() => act({ op: "preset", id, name: pr })}>{pr}</button>)}
        </div>
        <TimerBox ids={[id]} anyOn={d.on} tm={tm} />
      </div>
    );
  }
  return (
    <div className="ppanel"><div className="ptitle">{d.name}</div>
      <div className="small fit">{[d.title, d.artist].filter(Boolean).join(" · ") || (d.on ? "Idle" : "Off")}</div>
      <div className="steps bigsteps">
        <button onClick={() => act({ op: "media", id, action: "previous" })} aria-label="Previous"><Icon name="skip-back" /></button>
        <button className={d.playing ? "on" : ""} onClick={() => act({ op: "media", id, action: d.playing ? "pause" : "play" })} aria-label="Play or pause"><Icon name={d.playing ? "pause" : "play"} /></button>
        <button onClick={() => act({ op: "media", id, action: "next" })} aria-label="Next"><Icon name="skip-forward" /></button>
      </div>
      {d.volume != null && <Slider label="Volume" value={d.volume} onChange={(v, f) => act({ op: "volume", id, level: v }, f)} />}
      {d.volume != null && <button className="chip wide" onClick={() => { if (muted == null) { setMuted(d.volume ?? 0.3); act({ op: "volume", id, level: 0 }); } else { act({ op: "volume", id, level: muted }); setMuted(null); } }}>{muted == null ? "Mute" : "Unmute"}</button>}
    </div>
  );
}

/** What a tile shows while one of its devices has a timer: the time it fires, e.g. "10:45". */
const badgeOf = (tm: TimerApi, ids: string[]) => { const t = timerOf(tm.live, ids, tm.now); return t ? fmtClock(t.at).time : undefined; };

/** "Switch off after" chips (or "on after" when the device is off), what is running, and Cancel. */
function TimerBox({ ids, anyOn, tm }: { ids: string[]; anyOn: boolean; tm: TimerApi }) {
  const cur = timerOf(tm.live, ids, tm.now), on = cur ? cur.on : !anyOn;
  return (
    <div className="ptimer">
      <div className="cap">{on ? "Switch on after" : "Switch off after"}</div>
      <div className="chips">{TIMER_CHOICES.map((c) => <button key={c.minutes} className="chip" onClick={() => tm.set(ids, c.minutes, on)}>{c.label}</button>)}</div>
      {cur && <div className="row ptimer-run"><Icon name="timer" /><span className="mid">{cur.on ? "On" : "Off"} at {fmtTime(cur.at)}</span><span style={{ flex: 1 }} /><button className="chip" onClick={() => tm.cancel(ids)}>Cancel</button></div>}
    </div>
  );
}
