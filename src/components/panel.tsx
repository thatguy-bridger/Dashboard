"use client";
import { useRef, useState } from "react";
import type { Device, Home } from "@/lib/ha";
import { until } from "@/lib/format";
import { post, type Call } from "@/lib/useApi";
import type { Ev, Music } from "@/lib/types";
import { FanTile, Level, LightTile } from "./controls";
import { Icon, type IconName } from "./Icon";
import { Clock, DateLine, Dot } from "./widgets";

/** The control panel: a full-time touch panel for home control (role "control" or view "home"). Rooms in a list on the left, big targets, no
 *  'Done', no idle scenes. A slim header keeps the clock (hold it to open the screen settings) and the next event. */
export function Panel({ now, home, call, reload, hide, music, events, onMusic, name }: {
  now: number; home: Home | null; call: Call; reload: () => void; hide: string[]; music: Music | null; events: Ev[]; onMusic: (c: Record<string, unknown>) => void; name?: string;
}) {
  const [tab, setTab] = useState("home");
  const last = useRef(0);
  const throttled = (fn: () => void, final: boolean) => { const n = Date.now(); if (final || n - last.current > 180) { last.current = n; fn(); } };
  const send = async (b: Record<string, unknown>) => { await post(call, b); setTimeout(reload, 350); };
  const devices = home?.devices ?? [];
  const lights = devices.filter((d) => d.kind === "light" || d.kind === "plug");
  const rooms = (home?.rooms ?? []).filter((r) => !hide.includes(r));
  const fans = devices.filter((d) => d.kind === "fan"), speakers = devices.filter((d) => d.kind === "media");
  const anyOn = lights.some((l) => l.on);
  const next = events.find((e) => !e.allDay);
  const tabs: { id: string; label: string; icon: IconName; n?: number }[] = [
    { id: "home", label: "Home", icon: "home" },
    ...rooms.map((r) => ({ id: `room:${r}`, label: r, icon: "bulb" as IconName, n: lights.filter((l) => l.room === r && l.on).length })),
    ...(fans.length ? [{ id: "fans", label: "Fans", icon: "fan" as IconName }] : []), ...(speakers.length ? [{ id: "speakers", label: "Speakers", icon: "speaker" as IconName }] : []),
  ];
  const cur = tabs.some((t) => t.id === tab) ? tab : "home";
  const avg = lights.filter((l) => l.on && l.brightness != null).reduce((s, l, _, a) => s + (l.brightness ?? 1) / a.length, 0) || (anyOn ? 1 : 0);

  return (
    <div className="panel">
      <header className="phead">
        <div className="row" style={{ gap: "2.6vmin", alignItems: "baseline" }}><Clock now={now} className="mini" /><div><DateLine now={now} />{name && <div className="small" style={{ marginTop: ".4vmin" }}>{name}</div>}</div></div>
        {next && <div className="pill"><Dot color={next.color} /><span className="fit">{next.title}</span><b>{until(next.start, now)}</b></div>}
      </header>
      <div className="pwrap">
        <nav className="pnav" aria-label="Rooms">
          {tabs.map((t) => <button key={t.id} className={cur === t.id ? "on" : ""} onClick={() => setTab(t.id)}><Icon name={t.icon} /><span className="fit">{t.label}</span>{t.n ? <span className="navcount">{t.n}</span> : null}</button>)}
          {!home?.reachable && <div className="small" style={{ padding: "1vmin 2vmin" }}>Home Assistant isn&apos;t answering</div>}
        </nav>
        <main className="pmain">
          {cur === "home" && (
            <div className="pstack">
              <div className="tile"><Level icon="bulb" label={`All lights · ${lights.filter((l) => l.on).length} on`} value={avg}
                onIcon={() => send({ op: "many", ids: lights.filter((l) => !(anyOn && /\bled\b/i.test(l.name))).map((l) => l.id), on: !anyOn })}
                onChange={(v, f) => throttled(() => post(call, { op: "brightness", ids: lights.filter((l) => l.dimmable).map((l) => l.id), pct: Math.max(1, v * 100) }), f)} /></div>
              <div className="grid scenegrid">
                {([["night", "It's the night", "moon"], ["leaving", "I'm leaving", "walk"], ["returning", "I'm back", "home"]] as [string, string, IconName][]).map(([n, l, ic]) => <button key={n} className="tile mid row bigtile" onClick={() => send({ op: "scene", name: n })}><Icon name={ic} />{l}</button>)}
                <button className={`tile mid row bigtile ${home?.musicLights ? "lit" : ""}`} onClick={() => send({ op: "musicLights", on: !home?.musicLights })}><Icon name="note" />Music lights · {home?.musicLights ? "on" : "off"}</button>
              </div>
              {music && (
                <div className="tile musictile">
                  <div className="row"><div style={{ minWidth: 0, flex: 1 }}><div className="cap">{music.playing ? "Playing" : "Paused"}{music.device ? ` · ${music.device}` : ""}</div><div className="mid clamp1">{music.track}</div><div className="small clamp1">{music.artist}</div></div></div>
                  <div className="steps bigsteps">
                    <button onClick={() => onMusic({ action: "previous" })} aria-label="Previous"><Icon name="skip-back" /></button>
                    <button className={music.playing ? "on" : ""} onClick={() => onMusic({ action: music.playing ? "pause" : "play" })} aria-label="Play or pause"><Icon name={music.playing ? "pause" : "play"} /></button>
                    <button onClick={() => onMusic({ action: "next" })} aria-label="Next"><Icon name="skip-forward" /></button>
                  </div>
                </div>
              )}
            </div>
          )}
          {cur.startsWith("room:") && (() => {
            const room = cur.slice(5), ls = lights.filter((l) => l.room === room), on = ls.some((l) => l.on);
            return (
              <div className="pstack">
                <div className="row"><div className="cap">{room}</div><span style={{ flex: 1 }} /><button className="chip bigchip" onClick={() => send({ op: "many", ids: ls.map((l) => l.id), on: !on })}>{on ? "Turn all off" : "Turn all on"}</button></div>
                <div className="grid">{ls.map((l: Device) => <LightTile key={l.id} l={l} send={send} throttled={throttled} call={call} />)}</div>
              </div>
            );
          })()}
          {cur === "fans" && <div className="grid">{fans.map((f) => <FanTile key={f.id} f={f} send={send} />)}</div>}
          {cur === "speakers" && (
            <div className="grid">{speakers.map((s) => (
              <div key={s.id} className="tile">
                <div className="row"><Icon name="speaker" /><div style={{ minWidth: 0, flex: 1 }}><div className="mid fit">{s.name}</div><div className="small fit">{[s.title, s.artist].filter(Boolean).join(" · ") || (s.on ? "Idle" : "Off")}</div></div></div>
                <div className="steps bigsteps">
                  <button onClick={() => send({ op: "media", id: s.id, action: "previous" })} aria-label="Previous"><Icon name="skip-back" /></button>
                  <button className={s.playing ? "on" : ""} onClick={() => send({ op: "media", id: s.id, action: s.playing ? "pause" : "play" })} aria-label="Play or pause"><Icon name={s.playing ? "pause" : "play"} /></button>
                  <button onClick={() => send({ op: "media", id: s.id, action: "next" })} aria-label="Next"><Icon name="skip-forward" /></button>
                </div>
                {s.volume != null && <Level icon="speaker" label="Volume" value={s.volume} onChange={(v, f) => throttled(() => post(call, { op: "volume", id: s.id, level: v }), f)} />}
              </div>))}</div>
          )}
        </main>
      </div>
    </div>
  );
}
