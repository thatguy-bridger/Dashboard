"use client";
// The hero layer of FOCUS mode. Each scene is its own component over the same props; the shell draws the zones (pills, strip, peek, takeover) and the
// rail around them. Swap this file, or any entry of SCENE_VIEWS, to change the look without touching how scenes are chosen.
import { resolveConfig, type SceneId } from "@/lib/scenes";
import { countdown, fmtTime, until, when } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { LyricTicker, LyricsBlock } from "@/components/lyrics";
import { Timeline } from "@/components/timeline";
import { ArtTile, Clock, DateLine, Dot, EventList, Progress, Transport, VolumePill, WeatherCard } from "@/components/widgets";
import type { SceneProps } from "./types";

const greeting = (h: number) => (h < 5 ? "Still up?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

/** Idle = Standby: the big clock and the weather. The zones add the next-event pill and the Next Up strip. */
export function Idle(p: SceneProps) {
  return (
    <div className="sc idle">
      <div className="left"><div><Clock now={p.now} /><DateLine now={p.now} away={p.away} /><LyricTicker view={p.lyric} /></div><WeatherCard w={p.data?.weather ?? null} /></div>
    </div>
  );
}

/** Music = art-forward: the cover takes over, the accent and backdrop follow it, the lyrics are the main text. */
function MusicScene(p: SceneProps) {
  const m = p.music; if (!m) return <Idle {...p} />;
  const lyr = p.lyric;
  return (
    <div className="sc music">
      <div className="mtop"><div className="row" style={{ gap: "2.4vmin" }}><Clock now={p.now} className="mini" /><DateLine now={p.now} /></div></div>
      <div className="mbody">
        <ArtTile src={p.art} className="art hero" />
        <div className="mmeta">
          <div className="cap">{m.playing ? "Now playing" : "Paused"}{m.device ? ` · ${m.device}` : ""}</div>
          {lyr ? (
            <>
              <div className="track title-small clamp1">{m.track}</div>
              <div className="mid clamp1" style={{ opacity: .6 }}>{m.artist}</div>
              <LyricsBlock view={lyr} />
            </>
          ) : (
            <>
              <div className="track clamp3">{m.track}</div>
              <div className="mid clamp1" style={{ opacity: .6, fontSize: "3.2vmin" }}>{m.artist}</div>
            </>
          )}
          <div style={{ margin: "2.4vmin 0 1.8vmin" }}><Progress m={m} now={p.now} /></div>
          <Transport m={m} control={p.control} />
          {m.next && <div className="small" style={{ marginTop: "2vmin" }}>Next · {m.next.track}{m.next.artist ? ` · ${m.next.artist}` : ""}</div>}
        </div>
        <VolumePill m={m} control={p.control} />
      </div>
    </div>
  );
}

/** Soon = the Timeline with the next event grown into a countdown. */
function Soon(p: SceneProps) {
  const e = p.decision.focus; if (!e) return <Idle {...p} />;
  const lead = resolveConfig(p.data?.screen).soonLeadMin * 60;
  const toStart = (e.start * 1000 - p.now) / 1000;
  const started = toStart <= 0;
  const frac = started ? 1 : Math.min(1, Math.max(0, 1 - toStart / lead));
  const R = 46, C = 2 * Math.PI * R;
  return (
    <div className="sc soon">
      <div className="stop"><div><Clock now={p.now} className="mini" /><LyricTicker view={p.lyric} /></div></div>
      <div className="scenter">
        <div className="ring">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r={R} className="rtrack" /><circle cx="50" cy="50" r={R} className="rfill" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - frac) }} /></svg>
          <div className="rtext"><div className="cap">{started ? "Happening now" : "Starts in"}</div><div className="count">{started ? "Now" : countdown(toStart)}</div></div>
        </div>
        <div className="sinfo">
          <div className="stitle clamp3"><Dot color={e.color} />{e.title}</div>
          <div className="mid" style={{ opacity: .65 }}>{fmtTime(e.start * 1000)} – {fmtTime(e.end * 1000)}{e.location ? ` · ${e.location}` : ""}</div>
        </div>
      </div>
      <Timeline events={p.events} now={p.now} compact />
    </div>
  );
}

/** Day = the Timeline on a busy day (school, church): the day as a line with a now marker, the next event as the headline. */
function Day(p: SceneProps) {
  const next = p.events.find((e) => !e.allDay && e.end * 1000 > p.now);
  const h = new Date(p.now).getHours();
  return (
    <div className="sc day">
      <div className="dtop"><div className="row" style={{ gap: "2.4vmin", alignItems: "baseline" }}><Clock now={p.now} className="mini" /><div><div className="greet small-greet">{greeting(h)}</div><DateLine now={p.now} /></div></div><LyricTicker view={p.lyric} /></div>
      <div className="dmid">
        {next ? (
          <div className="card nextcard">
            <div className="cap">{next.start * 1000 <= p.now ? "Happening now" : `Next · ${until(next.start, p.now)}`}</div>
            <div className="stitle clamp3"><Dot color={next.color} />{next.title}</div>
            <div className="mid" style={{ opacity: .65 }}>{when(next, p.now)}{next.location ? ` · ${next.location}` : ""}</div>
          </div>
        ) : <div className="card nextcard"><div className="cap">Today</div><div className="mid">Nothing left today</div></div>}
        <WeatherCard w={p.data?.weather ?? null} />
      </div>
      <Timeline events={p.events} now={p.now} />
    </div>
  );
}

function Morning(p: SceneProps) {
  const h = new Date(p.now).getHours();
  const today = p.events.filter((e) => new Date(e.start * 1000).toDateString() === new Date(p.now).toDateString() || (e.start * 1000 < p.now && e.end * 1000 > p.now));
  return (
    <div className="sc morning">
      <div className="left">
        <div><div className="greet">{greeting(h)}</div><DateLine now={p.now} /></div>
        <WeatherCard w={p.data?.weather ?? null} big />
        <div><Clock now={p.now} className="mini" /><LyricTicker view={p.lyric} /></div>
      </div>
      <div className="right"><EventList events={today.length ? today : p.events} now={p.now} title={today.length ? "Today" : "Up next"} max={6} /></div>
    </div>
  );
}

function Night(p: SceneProps) {
  const next = p.events.find((e) => e.start * 1000 - p.now < 12 * 3600 * 1000);
  return (
    <div className="sc night">
      <Clock now={p.now} className="night-clock" />
      {next && <div className="small" style={{ marginTop: "2vmin" }}>{when(next, p.now)} · {next.title}</div>}
    </div>
  );
}

function Away(p: SceneProps) {
  const next = p.events[0];
  return (
    <div className="sc away">
      <div className="cap">Away</div>
      <Clock now={p.now} className="mini big2" />
      <DateLine now={p.now} />
      <LyricTicker view={p.lyric} />
      <div className="row" style={{ marginTop: "3vmin" }}><WeatherCard w={p.data?.weather ?? null} /></div>
      {next && <div className="small" style={{ marginTop: "3vmin" }}>Next · {next.title} · {when(next, p.now)}</div>}
    </div>
  );
}

function Offline(p: SceneProps) {
  return (
    <div className="sc offline">
      <div className="left"><div><Clock now={p.now} /><DateLine now={p.now} /></div><WeatherCard w={p.data?.weather ?? null} /></div>
      <div className="note small row" style={{ justifyContent: "center" }}><Icon name="clock" /> Waiting for Permuta · {p.decision.reason}</div>
    </div>
  );
}

export const SCENE_VIEWS: Record<SceneId, (p: SceneProps) => React.JSX.Element> = { idle: Idle, music: MusicScene, soon: Soon, day: Day, morning: Morning, night: Night, away: Away, offline: Offline };
