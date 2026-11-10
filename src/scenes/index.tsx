"use client";
// The hero layer of FOCUS mode. Each scene is its own component over the same props; the shell draws the zones (pills, strip, peek, takeover) and the
// rail around them. Swap this file, or any entry of SCENE_VIEWS, to change the look without touching how scenes are chosen.
import { resolveConfig, type SceneId } from "@/lib/scenes";
import { countdown, fmtTime, until, when } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { LyricTicker, LyricsBlock } from "@/components/lyrics";
import { GradientTitle } from "@/components/title";
import { AlbumLine, ArtistsLine, ArtTile, Clock, DateLine, Dot, EventList, Progress, Transport, VolumePill, WeatherCard } from "@/components/widgets";
import { PlayEntry, PlayPanel } from "@/components/playpanel";
import { parseSchool } from "@/lib/sources/school";
import type { SceneProps } from "./types";

const greeting = (h: number) => (h < 5 ? "Still up?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

/** Idle = Standby: the big clock and the weather. The zones add the next-event pill and the Next Up strip. */
export function Idle(p: SceneProps) {
  return (
    <div className="sc idle">
      <div className="left"><WeatherCard w={p.data?.weather ?? null} /></div>
    </div>
  );
}

/** Music = art-forward: the cover takes over, the accent and backdrop follow it, the lyrics are the main text. (The small clock and date are in the frame's header.) */
function MusicScene(p: SceneProps) {
  const m = p.music;
  if (!m) return <div className="sc music"><div className="mbody empty"><PlayPanel data={p.data} control={p.control} big /></div></div>;      // nothing playing: the Music page offers to start something
  const lyr = p.lyric;
  const fallback = p.theme.accent;
  const id = m.trackId ?? m.track;
  const controls = (p.data?.screen as Record<string, unknown> | undefined)?.musicControls !== 0;
  return (
    <div className="sc music">
      <div className="mbody">
        <ArtTile src={p.art} className="art hero" />
        <div className="mmeta">
          <div className="cap fit">{m.ended ? "Finished" : m.playing ? "Now playing" : "Paused"}{m.device ? ` · ${m.device}` : ""}</div>
          {lyr ? (
            <>
              <GradientTitle text={m.track} id={id} palette={m.palette} fallback={fallback} className="track title-small" maxLines={2} />
              <ArtistsLine m={m} /><AlbumLine album={m.album} />
              <LyricsBlock view={lyr} />
            </>
          ) : (
            <>
              <GradientTitle text={m.track} id={id} palette={m.palette} fallback={fallback} className="track" maxLines={2} />
              <ArtistsLine m={m} /><AlbumLine album={m.album} />
            </>
          )}
          <div className="mprog"><Progress m={m} now={p.now} /></div>
          {controls && <div className="mrow"><Transport m={m} control={p.control} /><PlayEntry data={p.data} playingOn={m.device} control={p.control} /></div>}
          {m.next && <div className="small fit mnext">Next · {m.next.track}{m.next.artist ? ` · ${m.next.artist}` : ""}</div>}
        </div>
        <VolumePill m={m} control={p.control} />
      </div>
    </div>
  );
}

/** Soon = the next event grown into a countdown (the day timeline sits in the frame's foot, in its own row). */
function Soon(p: SceneProps) {
  const e = p.decision.focus; if (!e || e.end * 1000 <= p.now) return <Idle {...p} />;          // an event that is over never lingers
  const lead = resolveConfig(p.data?.screen).soonLeadMin * 60;
  const toStart = (e.start * 1000 - p.now) / 1000;
  const started = toStart <= 0;
  const frac = started ? 1 : Math.min(1, Math.max(0, 1 - toStart / lead));
  const R = 46, C = 2 * Math.PI * R;
  return (
    <div className="sc soon">
      <div className="scenter">
        <div className="ring">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r={R} className="rtrack" /><circle cx="50" cy="50" r={R} className="rfill" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - frac) }} /></svg>
          <div className="rtext"><div className="cap">{started ? "Happening now" : "Starts in"}</div><div className="count">{started ? "Now" : countdown(toStart)}</div></div>
        </div>
        <div className="sinfo">
          <div className="stitle clamp3"><Dot color={e.color} />{e.title}</div>
          <div className="mid soft">{fmtTime(e.start * 1000)} – {fmtTime(e.end * 1000)}{e.location ? ` · ${e.location}` : ""}</div>
          
        </div>
      </div>
    </div>
  );
}

/** Day = a busy day (school, church): the next event as the headline; the clock, greeting and date are in the header, the day timeline in the foot. */
function Day(p: SceneProps) {
  const next = p.events.find((e) => !e.allDay && e.end * 1000 > p.now);
  return (
    <div className="sc day">
      <div className="dmid">
        {next ? (
          <div className="card nextcard">
            <div className="cap">{next.start * 1000 <= p.now ? "Happening now" : `Next · ${until(next.start, p.now)}`}</div>
            <div className="stitle clamp3"><Dot color={next.color} />{next.title}</div>
            <div className="mid soft">{when(next, p.now)}{next.location ? ` · ${next.location}` : ""}</div>
            
          </div>
        ) : <div className="card nextcard"><div className="cap">Today</div><div className="mid">Nothing left today</div></div>}
        <WeatherCard w={p.data?.weather ?? null} />
      </div>
    </div>
  );
}

function Morning(p: SceneProps) {
  const h = new Date(p.now).getHours();
  const today = p.events.filter((e) => new Date(e.start * 1000).toDateString() === new Date(p.now).toDateString() || (e.start * 1000 < p.now && e.end * 1000 > p.now));
  const school = parseSchool(p.ctx.extra.school), periods = school?.periods ?? [];       // the day's periods, when Permuta sent a school day
  return (
    <div className="sc morning">
      <div className="left">
        <div><div className="greet">{greeting(h)}</div></div>
        <WeatherCard w={p.data?.weather ?? null} big />
      </div>
      <div className="right">
        <EventList events={today.length ? today : p.events} now={p.now} title={today.length ? "Today" : "Up next"} max={periods.length ? 3 : 6} />
        {periods.length > 0 && (
          <div className="card mperiods"><div className="cap">{school?.day ? `School · ${school.day} day` : "School"}</div>
            {periods.slice(0, 7).map((x, i) => <div key={i} className={`mperiod ${x.end * 1000 < p.now ? "past" : ""}`}><span className="mp-n">{x.period ?? ""}</span><span className="mp-c fit">{x.class}</span><span className="mp-t">{fmtTime(x.start * 1000)}</span></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Night(p: SceneProps) {
  const next = p.events.find((e) => e.start * 1000 - p.now < 12 * 3600 * 1000);
  return (
    <div className="sc night">
      <Clock now={p.now} className="night-clock" />
      {next && <div className="small" style={{ marginTop: "calc(2 * var(--u))" }}>{when(next, p.now)} · {next.title}</div>}
    </div>
  );
}

function Away(p: SceneProps) {
  const next = p.events[0];
  return (
    <div className="sc away">
      <div className="cap">Away</div>
      
      <div className="row" style={{ marginTop: "calc(3 * var(--u))" }}><WeatherCard w={p.data?.weather ?? null} /></div>
      {next && <div className="small" style={{ marginTop: "calc(3 * var(--u))" }}>Next · {next.title} · {when(next, p.now)}</div>}
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
