"use client";
// The Today page: the few things that matter right now, the most important one biggest, re-ranked as the day moves. (Ranking lives in src/lib/today.ts.)
import { useLayoutEffect, useMemo, useRef } from "react";
import { todayCards, type TodayId } from "@/lib/today";
import { useForecast } from "@/lib/useForecast";
import { compass, dayOutlook } from "@/lib/forecast";
import { fmtTime, until, when } from "@/lib/format";
import { conditionText } from "@/lib/sources/weather";
import { schoolOf } from "@/lib/sources/school";
import { parseMail } from "@/lib/sources/mail";
import { parseJournal } from "@/lib/sources/journal";
import { parseCar } from "@/lib/sources/car";
import { parseLife } from "@/lib/sources/life";
import { Icon, weatherIconName, type IconName } from "@/components/Icon";
import { ArtTile, Dot, Progress } from "@/components/widgets";
import type { SceneProps } from "@/scenes/types";

type Slot = { title: string; icon: IconName; body: React.ReactNode };

export function TodayScene(p: SceneProps) {
  const loc = p.data?.location ?? null;
  const f = useForecast(loc);
  const extra = useMemo(() => {
    const next = f?.hours.filter((h) => h.t >= p.now && h.t < p.now + 4 * 3600000) ?? [];
    return { rainSoon: next.some((h) => h.pop >= 60), severe: (p.data?.weather?.current?.weather_code ?? 0) >= 95 };
  }, [f, p.now, p.data?.weather?.current?.weather_code]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cards = todayCards({ ...p.ctx, now: p.now }, extra);

  // cards glide to their new places when the ranking changes
  const grid = useRef<HTMLDivElement>(null), prev = useRef<Record<string, DOMRect>>({});
  useLayoutEffect(() => {
    const el = grid.current; if (!el) return;
    const now: Record<string, DOMRect> = {};
    el.querySelectorAll<HTMLElement>("[data-card]").forEach((n) => {
      const id = n.dataset.card!, r = n.getBoundingClientRect(); now[id] = r;
      const o = prev.current[id];
      if (o && (Math.abs(o.left - r.left) > 2 || Math.abs(o.top - r.top) > 2)) {
        try {
          n.style.transition = "none"; n.style.transform = `translate(${o.left - r.left}px, ${o.top - r.top}px)`;
          requestAnimationFrame(() => requestAnimationFrame(() => { n.style.transition = "transform .7s cubic-bezier(.2,.8,.2,1)"; n.style.transform = ""; }));
        } catch { /* no animation on old browsers */ }
      }
    });
    prev.current = now;
  }, [cards.map((c) => c.id).join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps

  const slots: Record<TodayId, () => Slot | null> = {
    next: () => {
      const evs = p.events.slice(0, 4); if (!evs.length) return null;
      const e = evs[0];
      return { title: e.start * 1000 <= p.now ? "Happening now" : "Up next", icon: "calendar", body: (
        <>
          <div className="tc-big clamp2">{e.title}</div>
          <div className="tc-sub">{e.start * 1000 <= p.now ? `until ${fmtTime(e.end * 1000)}` : `${until(e.start, p.now)} · ${fmtTime(e.start * 1000)}`}{e.location ? ` · ${e.location}` : ""}</div>
          <div className="tc-list">{evs.slice(1).map((x, i) => <div key={i} className="row evrow"><Dot color={x.color} /><div className="mid clamp1" style={{ flex: 1 }}>{x.title}</div><div className="small">{when(x, p.now)}</div></div>)}</div>
        </>) };
    },
    school: () => {
      const s = schoolOf(p.ctx); if (!s) return null;
      const cur = s.now ?? s.next; if (!cur) return null;
      return { title: s.now ? "In class" : "Next class", icon: "school", body: (
        <>
          <div className="tc-big clamp2">{cur.class}</div>
          <div className="tc-sub">{s.now ? `until ${fmtTime(cur.end * 1000)}` : `${until(cur.start, p.now)} · ${fmtTime(cur.start * 1000)}`}{cur.room ? ` · room ${cur.room}` : ""}{s.day ? ` · ${s.day} day` : ""}</div>
          <div className="tc-list">{s.periods.filter((x) => x.end * 1000 > p.now && x !== cur).slice(0, 3).map((x, i) => <div key={i} className="row evrow"><div className="small" style={{ width: "calc(4 * var(--u))" }}>{x.period}</div><div className="mid clamp1" style={{ flex: 1 }}>{x.class}</div><div className="small">{fmtTime(x.start * 1000)}</div></div>)}</div>
        </>) };
    },
    music: () => {
      const m = p.music; if (!m) return null;
      return { title: m.playing ? "Now playing" : "Paused", icon: "note", body: (
        <div className="tc-music">
          <ArtTile src={p.art} className="tc-art" />
          <div className="tc-mtext"><div className="tc-big clamp2">{m.track}</div><div className="tc-sub clamp1">{m.artist}</div><Progress m={m} now={p.now} /></div>
        </div>) };
    },
    weather: () => {
      const w = p.data?.weather; const c = w?.current; if (!c) return null;
      const night = c.is_day === 0, hi = w?.daily?.temperature_2m_max[0], lo = w?.daily?.temperature_2m_min[0];
      return { title: "Weather", icon: weatherIconName(c.weather_code, night), body: (
        <>
          <div className="row" style={{ alignItems: "baseline", gap: "calc(2 * var(--u))" }}><div className="tc-temp">{Math.round(f?.current.temp ?? c.temperature_2m)}°</div><div className="tc-big">{conditionText(c.weather_code)}</div></div>
          <div className="tc-sub">{hi != null && lo != null ? `High ${Math.round(hi)}° · Low ${Math.round(lo)}°` : ""}{f ? ` · wind ${Math.round(f.current.wind)} mph ${compass(f.current.dir)}` : ""}</div>
          {f && <div className="tc-sub" style={{ opacity: .85 }}>{dayOutlook(f, p.now, conditionText)}</div>}
        </>) };
    },
    mail: () => {
      const m = parseMail(p.ctx.extra.mail); if (!m) return null;
      const mis = m.missionaries.filter((x) => x.unread > 0);
      return { title: "Mail", icon: "mail", body: (
        <>
          <div className="row" style={{ alignItems: "baseline", gap: "calc(1.6 * var(--u))" }}><div className="tc-temp">{m.priority || m.unread}</div><div className="tc-sub">{m.priority ? "that matter" : "unread"}</div></div>
          <div className="tc-list">{(mis.length ? mis.map((x) => ({ k: x.name, t: x.last ?? "" })) : m.recent.map((x) => ({ k: x.from, t: x.subject }))).slice(0, 3).map((r, i) => <div key={i} style={{ minWidth: 0 }}><div className="mid clamp1">{r.k}</div><div className="small clamp1">{r.t}</div></div>)}</div>
        </>) };
    },
    journal: () => {
      const j = parseJournal(p.ctx.extra.journal); if (!j) return null;
      return { title: "Journal", icon: "book", body: (<><div className="tc-big clamp3">{j.prompt || "How was today?"}</div><div className="tc-sub">{j.streak > 0 ? `${j.streak}-day streak` : "Start with one line"}</div></>) };
    },
    car: () => {
      const c = parseCar(p.ctx.extra.car); if (!c) return null;
      return { title: "Car", icon: "car", body: (<><div className="tc-big">{c.fuelPct != null ? `Fuel ${Math.round(c.fuelPct)}%` : c.batteryPct != null ? `Battery ${Math.round(c.batteryPct)}%` : "Car"}</div><div className="tc-sub">{c.locked === false ? "Unlocked" : c.rangeMi != null ? `${Math.round(c.rangeMi)} mi of range` : ""}{c.parkedAt ? ` · ${c.parkedAt}` : ""}</div></>) };
    },
    life: () => {
      const s = parseLife(p.ctx.extra.life).slice(0, 3); if (!s.length) return null;
      return { title: "Your day", icon: "chart", body: (<><div className="tc-big">{s[0].value}</div><div className="tc-sub clamp1">{s[0].label}{s[0].detail ? ` · ${s[0].detail}` : ""}</div><div className="tc-list">{s.slice(1).map((x, i) => <div key={i} className="row evrow"><div className="mid" style={{ flex: 1 }}>{x.label}</div><div className="mid">{x.value}</div></div>)}</div></>) };
    },
  };

  const shown = cards.map((c) => ({ id: c.id, slot: slots[c.id]() })).filter((x): x is { id: TodayId; slot: Slot } => !!x.slot);
  if (!shown.length) return <div className="sc today"><div className="tc-empty"><Icon name="sun" /><div className="tc-big">A quiet day</div></div></div>;
  return (
    <div className="sc today">
      <div ref={grid} className={`today-grid n${Math.min(shown.length, 5)}`}>
        {shown.slice(0, 5).map(({ id, slot }, i) => (
          <div key={id} data-card={id} className={`card tc ${i === 0 ? "hero" : ""} k-${id}`}>
            <div className="row tc-head"><Icon name={slot.icon} className="pillicon" /><div className="cap">{slot.title}</div></div>
            <div className="tc-body">{slot.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
