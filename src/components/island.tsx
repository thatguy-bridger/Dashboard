"use client";
import { AlbumLine, ArtistsLine } from "@/components/widgets";
import { rgbVar } from "@/lib/color";
import { useEffect, useMemo, useRef, useState } from "react";
import { countdown, fmtTime, mmss } from "@/lib/format";
import { fitIsland, type Activity, type IslandPage, type IslandSelection } from "@/lib/island";
import type { PredMusic } from "@/lib/predict";
import { positionOf } from "@/lib/predict";
import { titleGradient } from "@/lib/theme";
import type { Ev } from "@/lib/types";
import { useLayers } from "@/lib/useLayers";
import { ArtTile } from "./widgets";
import { Icon, type IconName } from "./Icon";

// The dynamic island: one main item (the most pressing thing from OTHER pages) with small satellites beside it. Soft, not bouncy: the pill morphs between sizes with a
// gentle spring (CSS width / height / radius), its content cross-fades with a little blur, satellites slide and scale in and out with a short stagger, and the island
// "breathes" once when something new takes over. Same glass material as the rail indicator. Reduced motion gets plain fades (see the CSS).

type Size = { w: number; h: number };
/** Island sizes in units (1 unit = 1% of the shorter screen side, never below 5.4 px): a dot, the calm pill, a main item, and per-kind widths. */
const KIND_W: Record<string, number> = { music: 50, event: 46, alert: 58, away: 36, mail: 38, journal: 34, car: 36, battery: 38, lights: 32, musiclights: 36 };
export const islandSize = (main: Activity | null, calm: boolean): Size => (!main ? { w: 4.4, h: 4.4 } : calm ? { w: 42, h: 5.8 } : { w: KIND_W[main.kind] ?? 38, h: 7.4 });

/** A press helper: a tap, or a long press (~450 ms) that jumps to the page, never both. */
function usePress(onTap: () => void, onLong: () => void) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null), long = useRef(false);
  const cb = useRef({ onTap, onLong }); cb.current = { onTap, onLong };
  const clear = () => { if (t.current) clearTimeout(t.current); t.current = null; };
  return {
    onPointerDown: () => { long.current = false; clear(); t.current = setTimeout(() => { long.current = true; cb.current.onLong(); }, 450); },
    onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear,
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); if (!long.current) cb.current.onTap(); },
    onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
  };
}

/** Keeps a list's removed items around for a moment so they can slide out. Only the set of ids matters (not the array identity), so it never loops. */
function usePresence<T extends { id: string }>(items: T[], ms = 380) {
  const sig = items.map((i) => i.id).join("|");
  const itemsRef = useRef(items); itemsRef.current = items;
  const [entries, setEntries] = useState<{ item: T; leaving: boolean; until: number }[]>(() => items.map((item) => ({ item, leaving: false, until: 0 })));
  useEffect(() => {
    const now = Date.now(), cur = itemsRef.current, ids = new Set(cur.map((i) => i.id));
    setEntries((prev) => {
      const out: { item: T; leaving: boolean; until: number }[] = cur.map((item) => ({ item, leaving: false, until: 0 }));
      prev.forEach((e, idx) => { if (!ids.has(e.item.id) && (!e.leaving || e.until > now)) out.splice(Math.min(idx, out.length), 0, { item: e.item, leaving: true, until: e.leaving ? e.until : now + ms }); });
      return out;
    });
    const t = setTimeout(() => setEntries((p) => p.filter((e) => !e.leaving || e.until > Date.now())), ms + 40);
    return () => clearTimeout(t);
  }, [sig, ms]);
  return entries.map((e) => (e.leaving ? { item: e.item, leaving: true } : { item: itemsRef.current.find((i) => i.id === e.item.id) ?? e.item, leaving: false }));
}

const Eq = ({ on }: { on: boolean }) => <span className={`eq ${on ? "on" : ""}`} aria-hidden><i /><i /><i /></span>;

export function Island({ sel, now, music, events, onPin, onGo, act, control, accent }: {
  sel: IslandSelection; now: number; music: PredMusic | null; events: Ev[];
  onPin: (id: string) => void; onGo: (page: IslandPage) => void; act: (body: Record<string, unknown>) => void; control: (c: Record<string, unknown>) => void; accent: string;
}) {
  const { main, calm } = sel;
  const root = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ coreUnits: number; perSide: number } | null>(null);
  const [open, setOpen] = useState(false), [breathe, setBreathe] = useState(false), [touch, setTouch] = useState(0);
  const lastId = useRef<string | null>(null);
  const size = islandSize(main, calm);
  useEffect(() => {                                           // measure the header region: only as many satellites as fit, then a smaller pill
    const el = root.current?.parentElement; if (!el || typeof ResizeObserver === "undefined") return;
    const run = () => setFit(fitIsland({ availPx: el.clientWidth, unitPx: Math.max(Math.min(window.innerWidth, window.innerHeight) / 100, 5.4), coreUnits: size.w, maxPerSide: 3 }));
    run(); const ro = new ResizeObserver(run); ro.observe(el); return () => ro.disconnect();
  }, [size.w]);
  const mainId = main?.id ?? null;
  const tintBase = main?.kind === "music" ? (music?.palette?.[0] ?? main.tint ?? accent) : main?.tint ?? accent;

  useEffect(() => { if (mainId !== lastId.current) { if (lastId.current !== null || mainId) { setBreathe(true); const t = setTimeout(() => setBreathe(false), 1000); lastId.current = mainId; return () => clearTimeout(t); } lastId.current = mainId; } }, [mainId]);
  useEffect(() => { if (!open) return; const t = setTimeout(() => setOpen(false), 6000); return () => clearTimeout(t); }, [open, touch]);
  useEffect(() => { if (!main || calm) setOpen(false); }, [main, calm]);

  const press = usePress(() => { if (main && !calm) { setOpen((o) => !o); setTouch(Date.now()); } else if (main) onGo(main.page); }, () => { if (main) { setOpen(false); onGo(main.page); } });

  // content of the core pill, cross-faded when the main item changes
  const key = main ? `${main.id}` : "dot";
  const node = !main ? <span className="isl-dot" /> : main.kind === "music" && music ? (
    <div className="isl-row">
      <ArtTile src={music.art ?? null} className="isl-art" />
      <div className="isl-text"><div className="isl-title fit" style={{ backgroundImage: titleGradient(music.palette, accent) }}>{music.track}</div></div>
      <Eq on={!!music.playing} />
      <button className="isl-btn" aria-label="Play or pause" onClick={(e) => { e.stopPropagation(); control({ action: music.playing ? "pause" : "play" }); setTouch(Date.now()); }} onPointerDown={(e) => e.stopPropagation()}><Icon name={music.playing ? "pause" : "play"} /></button>
      <i className="isl-prog" style={{ transform: `scaleX(${music.duration ? Math.min(1, positionOf(music, now) / music.duration) : 0})` }} />
    </div>
  ) : (
    <div className="isl-row"><Icon name={main.icon as IconName} className="isl-icon" /><div className="isl-text isl-label"><span className="fit">{main.label}</span></div>{main.value && <b className="isl-value">{main.value}</b>}</div>
  );
  const snap = useRef(new Map<string, React.ReactNode>()); snap.current.set(key, node);
  if (snap.current.size > 5) { const k = snap.current.keys().next().value; if (k !== undefined && k !== key) snap.current.delete(k); }
  const layers = useLayers(key, 700);

  const per = fit?.perSide ?? 3;
  const shownSats = useMemo(() => ({ left: sel.left.slice(0, per), right: sel.right.slice(0, per) }), [sel.left, sel.right, per]);
  const leftP = usePresence(shownSats.left), rightP = usePresence(shownSats.right);
  const left = leftP, right = rightP;
  const sideFor = (arr: typeof leftP) => arr.map((s, i) => <Sat key={s.item.id} a={s.item} leaving={s.leaving} i={i} onPin={onPin} onGo={onGo} />);

  return (
    <div ref={root} className={`isl ${breathe ? "breathe" : ""} ${open ? "open" : ""}`} style={{ ["--isl-tint" as string]: tintBase, ["--isl-tint-rgb" as string]: rgbVar(tintBase) }} data-area="island">
      <div className="isl-sats left">{sideFor(left)}</div>
      <div className={`isl-core ${main ? "has" : "empty"} ${calm ? "calm" : ""} k-${main?.kind ?? "none"}`} data-area="islcore" role="button" tabIndex={0} aria-label={main ? main.label : "Nothing pressing"}
        style={{ ["--iw" as string]: fit ? Math.min(size.w, fit.coreUnits) : size.w, ["--ih" as string]: size.h }} {...press}>
        {layers.map((l) => <div key={l.id} className={`isl-layer ${l.leaving ? "leaving" : ""}`}>{l.leaving ? snap.current.get(l.key) ?? null : node}</div>)}
      </div>
      <div className="isl-sats right">{sideFor(right)}</div>
      {open && main && <><div className="isl-scrim" onPointerDown={() => setOpen(false)} /><ExpandedCard main={main} music={music} now={now} events={events} act={(b) => { act(b); setTouch(Date.now()); }} control={(c) => { control(c); setTouch(Date.now()); }} onGo={() => { setOpen(false); onGo(main.page); }} /></>}
    </div>
  );
}

function Sat({ a, leaving, i, onPin, onGo }: { a: Activity; leaving: boolean; i: number; onPin: (id: string) => void; onGo: (p: IslandPage) => void }) {
  const press = usePress(() => onPin(a.id), () => onGo(a.page === "weather" || a.page === "any" ? "today" : a.page));
  return (
    <button className={`sat ${leaving ? "leaving" : ""} k-${a.kind}`} style={{ ["--i" as string]: i }} aria-label={a.label} {...press}>
      <Icon name={a.icon as IconName} />{a.value && <span className="sat-v">{a.value}</span>}
    </button>
  );
}

function ExpandedCard({ main, music, now, events, act, control, onGo }: { main: Activity; music: PredMusic | null; now: number; events: Ev[]; act: (b: Record<string, unknown>) => void; control: (c: Record<string, unknown>) => void; onGo: () => void }) {
  const ev = events.find((e) => !e.allDay);
  let body: React.ReactNode;
  if (main.kind === "music" && music) {
    const pos = positionOf(music, now);
    body = (
      <>
        <div className="row" style={{ gap: "calc(2.4 * var(--u))", alignItems: "center" }}>
          <ArtTile src={music.art ?? null} className="isl-bigart" />
          <div style={{ minWidth: 0, flex: 1 }}><div className="isl-ctitle clamp" style={{ backgroundImage: titleGradient(music.palette, "#ece9e4") }}>{music.track}</div><ArtistsLine m={music} /><AlbumLine album={music.album} /></div>
        </div>
        <div className="isl-scrub"><div className="bar"><i style={{ width: `${music.duration ? Math.min(100, (pos / music.duration) * 100) : 0}%` }} /></div><div className="row" style={{ justifyContent: "space-between" }}><span className="small">{mmss(pos)}</span><span className="small">{mmss(music.duration)}</span></div></div>
        <div className="row isl-ctl">
          <button aria-label="Previous" onClick={() => control({ action: "previous" })}><Icon name="skip-back" /></button>
          <button className="main" aria-label="Play or pause" onClick={() => control({ action: music.playing ? "pause" : "play" })}><Icon name={music.playing ? "pause" : "play"} /></button>
          <button aria-label="Next" onClick={() => control({ action: "next" })}><Icon name="skip-forward" /></button>
        </div>
      </>
    );
  } else if (main.kind === "event" && ev) {
    const toStart = (ev.start * 1000 - now) / 1000;
    body = (
      <>
        <div className="cap">{toStart <= 0 ? "Happening now" : "Starts in"}</div>
        <div className="isl-count">{toStart <= 0 ? "Now" : countdown(toStart)}</div>
        <div className="isl-ctitle clamp">{ev.title}</div>
        <div className="small">{fmtTime(ev.start * 1000)} – {fmtTime(ev.end * 1000)}{ev.location ? ` · ${ev.location}` : ""}</div>
      </>
    );
  } else if (main.kind === "away") {
    body = (
      <>
        <div className="cap">Away</div><div className="isl-ctitle">Welcome back?</div>
        <div className="row isl-ctl wide"><button className="chip" onClick={() => act({ op: "scene", name: "returning" })}>I&apos;m back</button><button className="chip" onClick={() => act({ op: "musicLights", on: false })}>Music lights off</button></div>
      </>
    );
  } else {
    body = (<><div className="cap">{main.kind === "alert" ? "Alert" : main.label}</div>{main.kind === "alert" ? <div className="isl-ctitle clamp">{main.label}</div> : main.value && <div className="isl-count">{main.value}</div>}{main.detail && <div className="small">{main.detail}</div>}</>);
  }
  return (
    <div className={`isl-card k-${main.kind}`} onClick={(e) => e.stopPropagation()}>
      {body}
      <button className="isl-open" onClick={onGo}>Open page<Icon name="skip-forward" /></button>
    </div>
  );
}
