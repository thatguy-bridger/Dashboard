"use client";
// The calm-mode pages: the same cards as the zones and scenes, just larger. Each page id matches a source's `page.id` (src/lib/sources).
// (Not named "pages": Next.js reserves src/pages for the old router.)
import { useEffect, useState } from "react";
import { WeatherMap } from "@/components/weathermap";
import { compass, dayOutlook, forecastUrl, parseForecast, type Forecast } from "@/lib/forecast";
import { collectSlots } from "@/lib/slots";
import { sourceItems } from "@/lib/sources";
import { fmtTime } from "@/lib/format";
import { parseSchool } from "@/lib/sources/school";
import { parseMail } from "@/lib/sources/mail";
import { parseJournal } from "@/lib/sources/journal";
import { parseLife } from "@/lib/sources/life";
import { conditionText } from "@/lib/sources/weather";
import { Icon, weatherIconName, type IconName } from "@/components/Icon";
import { Timeline } from "@/components/timeline";
import { Dot, EventList, StripCard, WeatherCard } from "@/components/widgets";
import { Idle } from "@/scenes";
import { HomePage } from "@/components/home";
import type { SceneProps } from "@/scenes/types";

function Frame({ p, children }: { title: string; icon: IconName; p: SceneProps; children: React.ReactNode }) {
  // The time lives in the header (top left) on every page, so the page body starts right under it.
  void p;
  return (
    <div className="sc page">
      <div className="pbody">{children}</div>
    </div>
  );
}

function Standby(p: SceneProps) {
  const strip = collectSlots({ now: p.now, scene: "idle", events: p.events, info: sourceItems({ ...p.ctx, scene: "idle" }) }, []).strip;
  return (
    <div className="sc page standby-page">
      <div className="standby-hero"><Idle {...p} /></div>
      {strip.length > 0 && <div className="standby-strip"><div className="strip-row">{strip.map((s) => <StripCard key={s.id} item={s} />)}</div></div>}
    </div>
  );
}

function Today(p: SceneProps) {
  const today = p.events.filter((e) => new Date(e.start * 1000).toDateString() === new Date(p.now).toDateString());
  return (
    <Frame title="Today" icon="calendar" p={p}>
      <div className="pgrid two"><EventList events={today} now={p.now} title="Schedule" max={7} /><div className="card"><div className="cap" style={{ marginBottom: "calc(2 * var(--u))" }}>The day</div><Timeline events={today} now={p.now} compact /></div></div>
    </Frame>
  );
}

function useForecast(loc?: { lat: number; lon: number } | null) {
  const [f, setF] = useState<Forecast | null>(null);
  useEffect(() => {
    if (!loc) return;
    let dead = false;
    const load = async () => { try { const r = await fetch(forecastUrl(loc.lat, loc.lon)); if (r.ok && !dead) setF(parseForecast(await r.json())); } catch { /* keep the last one */ } };
    load(); const id = setInterval(load, 600000);
    return () => { dead = true; clearInterval(id); };
  }, [loc?.lat, loc?.lon]);   // eslint-disable-line react-hooks/exhaustive-deps
  return f;
}

function WeatherPage(p: SceneProps) {
  const loc = p.data?.location ?? null;
  const f = useForecast(loc);
  if (!f || !loc) return <WeatherBasic {...p} />;
  const c = f.current, today = f.days[0];
  const hrs = f.hours.filter((h) => h.t >= p.now - 1800000).slice(0, 12);
  const min = Math.min(...f.days.map((d) => d.lo)), max = Math.max(...f.days.map((d) => d.hi)), span = Math.max(1, max - min);
  return (
    <Frame title={loc.name && loc.name !== "Home" ? loc.name : "Weather"} icon="sun" p={p}>
      <div className="wx-page">
        <div className="wx-left">
          <div className="wx-hero">
            <div className="wx-temp">{Math.round(c.temp)}°</div>
            <div className="wx-side">
              <div className="wx-cond">{conditionText(c.code) || "Fair"}</div>
              <div className="wx-hl">High {Math.round(today.hi)}° · Low {Math.round(today.lo)}° · Feels {Math.round(c.feels)}°</div>
              <div className="wx-sum">{dayOutlook(f, p.now, conditionText)}</div>
            </div>
          </div>
          <div className="wx-facts"><span>Wind {Math.round(c.wind)} mph {compass(c.dir)}{c.gust > c.wind + 5 ? `, gusts ${Math.round(c.gust)}` : ""}</span><span>Humidity {Math.round(c.humidity)}%</span><span>UV {Math.round(c.uv)}</span><span>Sunrise {fmtTime(today.sunrise)}</span><span>Sunset {fmtTime(today.sunset)}</span></div>
          <div className="card wx-hours">{hrs.map((h, i) => (
            <div key={h.t} className="wx-h"><div className="t">{i === 0 ? "Now" : new Date(h.t).toLocaleTimeString([], { hour: "numeric" }).replace(" ", "").toLowerCase()}</div><Icon name={weatherIconName(h.code, !h.day)} className="ic" /><div className="tp">{Math.round(h.temp)}°</div><div className="pp">{h.pop >= 10 ? `${Math.round(h.pop / 10) * 10}%` : ""}</div><div className="wd">{Math.round(h.wind)} mph</div></div>))}
          </div>
          <div className="card wx-week">{f.days.slice(0, 7).map((d, i) => (
            <div key={d.date} className="wx-wr"><div className="d">{i === 0 ? "Today" : new Date(d.date + "T12:00").toLocaleDateString([], { weekday: "short" })}</div><Icon name={weatherIconName(d.code, false)} className="ic" /><div className="pp">{d.pop >= 20 ? `${Math.round(d.pop / 10) * 10}%` : ""}</div><div className="lo">{Math.round(d.lo)}°</div><div className="bar"><i style={{ left: `${((d.lo - min) / span) * 100}%`, right: `${100 - ((d.hi - min) / span) * 100}%` }} /></div><div className="hi">{Math.round(d.hi)}°</div></div>))}
          </div>
        </div>
        <WeatherMap lat={loc.lat} lon={loc.lon} />
      </div>
    </Frame>
  );
}

function WeatherBasic(p: SceneProps) {
  const w = p.data?.weather; const d = w?.daily;
  return (
    <Frame title="Weather" icon="sun" p={p}>
      <div className="pgrid two">
        <div className="col"><WeatherCard w={w ?? null} big /><div className="small" style={{ marginTop: "calc(1.6 * var(--u))" }}>{w?.current ? `${conditionText(w.current.weather_code)} right now` : ""}</div></div>
        <div className="card"><div className="cap" style={{ marginBottom: "calc(2 * var(--u))" }}>Week ahead</div>
          {d?.time.slice(0, 6).map((t, i) => (
            <div key={t} className="row weekrow"><div className="mid" style={{ width: "calc(14 * var(--u))" }}>{i === 0 ? "Today" : new Date(t + "T12:00").toLocaleDateString([], { weekday: "long" })}</div><Icon name={weatherIconName(d.weather_code[i], false)} className="weekicon" /><div className="mid" style={{ marginLeft: "auto" }}>{Math.round(d.temperature_2m_max[i])}°</div><div className="mid" style={{ opacity: .5, width: "calc(8 * var(--u))", textAlign: "right" }}>{Math.round(d.temperature_2m_min[i])}°</div></div>))}
        </div>
      </div>
    </Frame>
  );
}

function SchoolPage(p: SceneProps) {
  const s = parseSchool(p.ctx.extra.school); if (!s) return <Idle {...p} />;
  const cur = s.now ?? s.next;
  return (
    <Frame title={`School${s.day ? ` · ${s.day} day` : ""}`} icon="school" p={p}>
      <div className="pgrid two">
        <div className="card nextcard"><div className="cap">{s.now ? "In class" : "Next class"}</div>
          <div className="stitle clamp3">{cur?.class}</div>
          {cur && <div className="mid" style={{ opacity: .65 }}>{fmtTime(cur.start * 1000)} – {fmtTime(cur.end * 1000)}{cur.room ? ` · room ${cur.room}` : ""}</div>}
        </div>
        <div className="card"><div className="cap" style={{ marginBottom: "calc(2 * var(--u))" }}>Periods</div>
          {s.periods.slice(0, 8).map((x, i) => { const on = x.start * 1000 <= p.now && x.end * 1000 > p.now; return <div key={i} className={`row evrow ${on ? "on" : ""}`}><Dot color={on ? undefined : "rgba(255,255,255,.35)"} /><div className="mid" style={{ flex: 1 }}>{x.period ? `${x.period} · ` : ""}{x.class}</div><div className="small">{fmtTime(x.start * 1000)}</div></div>; })}
        </div>
      </div>
    </Frame>
  );
}

function MailPage(p: SceneProps) {
  const m = parseMail(p.ctx.extra.mail); if (!m) return <Idle {...p} />;
  return (
    <Frame title="Mail" icon="mail" p={p}>
      <div className="pgrid two">
        <div className="col"><div className="card"><div className="cap">Unread</div><div className="bignum">{m.unread}</div><div className="small">{m.priority > 0 ? `${m.priority} that matter` : "Nothing urgent"}</div></div></div>
        <div className="card"><div className="cap" style={{ marginBottom: "calc(2 * var(--u))" }}>{m.missionaries.length ? "Missionaries" : "Recent"}</div>
          {(m.missionaries.length ? m.missionaries.map((x) => ({ k: x.name, t: x.last ?? "", n: x.unread })) : m.recent.map((x) => ({ k: x.from, t: x.subject, n: 0 }))).slice(0, 5).map((r, i) => (
            <div key={i} className="row evrow"><Icon name="mail" className="pillicon" /><div style={{ minWidth: 0, flex: 1 }}><div className="mid clamp1">{r.k}</div><div className="small clamp1">{r.t}</div></div>{r.n > 0 && <span className="badge inline">{r.n}</span>}</div>))}
        </div>
      </div>
    </Frame>
  );
}

function JournalPage(p: SceneProps) {
  const j = parseJournal(p.ctx.extra.journal); if (!j) return <Idle {...p} />;
  return (
    <Frame title="Journal" icon="book" p={p}>
      <div className="pgrid two">
        <div className="card"><div className="cap">Streak</div><div className="row" style={{ alignItems: "baseline", gap: "calc(2 * var(--u))" }}><Icon name="flame" className="flame" /><div className="bignum">{j.streak}</div><div className="mid" style={{ opacity: .6 }}>days</div></div><div className="small">Best {j.best}</div></div>
        <div className="card nextcard"><div className="cap">{j.wroteToday ? "Written today" : j.due ? "Waiting for you" : "Tonight"}</div><div className="stitle clamp3">{j.prompt ?? "How was today?"}</div>{j.wroteToday && <div className="row"><Icon name="check" className="pillicon" /><div className="small">Done for today</div></div>}</div>
      </div>
    </Frame>
  );
}

function LifePage(p: SceneProps) {
  const stats = parseLife(p.ctx.extra.life); if (!stats.length) return <Idle {...p} />;
  return (
    <Frame title="Life" icon="chart" p={p}>
      <div className="pgrid stats">{stats.slice(0, 6).map((s, i) => <div key={i} className="card stat"><div className="row"><Icon name={(s.icon as IconName) ?? "sparkle"} className="pillicon" /><div className="cap">{s.label}</div></div><div className="bignum sm">{s.value}</div>{s.detail && <div className="small">{s.detail}</div>}</div>)}</div>
    </Frame>
  );
}

export const PAGES: Record<string, (p: SceneProps) => React.JSX.Element> = { home: HomePage, standby: Standby, today: Today, weather: WeatherPage, school: SchoolPage, mail: MailPage, journal: JournalPage, life: LifePage };
