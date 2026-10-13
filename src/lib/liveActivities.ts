"use client";

import { useEffect, useState } from "react";
import { useNowPlaying } from "@/lib/spotifyClient";
import { pollEvery } from "@/lib/poll";

export type ActivityKind = "event" | "game" | "music";

export interface LiveActivity {
  id: string;
  kind: ActivityKind;
  /** Higher wins the island. */
  priority: number;
  color: string;
  title: string;
  subtitle?: string;
  /** Live game details for the score pill. */
  game?: { home: string; away: string; homeScore: string; awayScore: string; homeBadge: string | null; awayBadge: string | null; status: string; league: string };
}

export interface FeedEvent { summary: string; start: string; end?: string; allDay: boolean; source: string; colorId: string | null; color?: string | null }

export interface FeedHour { time: string; tempF: number; weatherCode: number; precipProbability?: number }
export interface FeedDay { date: string; highF: number; lowF: number; weatherCode: number }
export interface FeedWeather {
  tempF: number; feelsLikeF?: number; isDay: boolean; weatherCode: number; highF: number; lowF: number; hourly: FeedHour[];
  forecast?: FeedDay[]; humidity?: number; windMph?: number; uvIndex?: number; sunrise?: string; sunset?: string;
}
export interface FeedDevice { id: string; name: string; deviceClass: string; batteryLevel: number | null; isPerson: boolean }

interface Snapshot {
  weather: FeedWeather | null;
  devices: FeedDevice[] | null;
  event: LiveActivity | null;
  games: LiveActivity[];
  /** Raw feeds, shared so StandBy doesn't poll the same endpoints a second time. */
  events: FeedEvent[] | null;
  calendarConnected: boolean;
}

// One shared poller per page (same pattern as spotifyClient): every consumer
// reads the same snapshot instead of each hitting the API.
let snap: Snapshot = { weather: null, devices: null, event: null, games: [], events: null, calendarConnected: false };
const listeners = new Set<(s: Snapshot) => void>();
const stops: (() => void)[] = [];

function publish(patch: Partial<Snapshot>) {
  snap = { ...snap, ...patch };
  listeners.forEach((fn) => fn(snap));
}

async function pollCalendar() {
  try {
    const res = await fetch("/api/calendar", { cache: "no-store" });
    if (!res.ok) return;
    const { events, connected } = await res.json();
    publish({ event: pickSoonEvent(events ?? []), events: events ?? [], calendarConnected: Boolean(connected) });
  } catch {
    // keep last
  }
}

type Ev = { summary: string; start: string; end?: string; allDay: boolean };

function pickSoonEvent(events: Ev[]): LiveActivity | null {
  const now = Date.now();
  for (const e of events) {
    if (e.allDay) continue;
    const start = new Date(e.start).getTime();
    const end = e.end ? new Date(e.end).getTime() : start + 60 * 60_000;
    if (end < now) continue;
    if (start - now > 30 * 60_000) return null; // sorted: nothing sooner follows
    return {
      id: `e-${e.summary}-${e.start}`,
      kind: "event",
      priority: 80,
      color: "#5ac8fa",
      title: e.summary,
      subtitle: start > now ? `in ${Math.max(1, Math.round((start - now) / 60_000))} min` : "happening now",
    };
  }
  return null;
}

async function pollWeather() {
  try {
    const res = await fetch("/api/weather");
    if (res.ok) publish({ weather: (await res.json()) as FeedWeather });
  } catch {
    // keep last
  }
}

async function pollDevices() {
  try {
    const res = await fetch("/api/icloud/findmy");
    if (res.ok) publish({ devices: ((await res.json()).devices ?? []) as FeedDevice[] });
  } catch {
    // keep last
  }
}

async function pollGame() {
  try {
    const res = await fetch("/api/sports?mode=live", { cache: "no-store" });
    if (!res.ok) return;
    const { games } = await res.json();
    publish({
      games: ((games ?? []) as NonNullable<LiveActivity["game"]>[]).map((g) => ({
        id: `g-${g.away}-${g.home}`,
        kind: "game" as const,
        priority: 70,
        color: "#34d399",
        title: `${g.away} ${g.awayScore} – ${g.homeScore} ${g.home}`,
        subtitle: `${g.league} · ${g.status}`,
        game: g,
      })),
    });
  } catch {
    // keep last
  }
}

function start() {
  if (stops.length) return;
  pollCalendar();
  pollGame();
  pollWeather();
  pollDevices();
  stops.push(pollEvery(pollCalendar, 5 * 60_000), pollEvery(pollGame, 5 * 60_000), pollEvery(pollWeather, 10 * 60_000), pollEvery(pollDevices, 10 * 60_000));
}

function stop() {
  stops.splice(0).forEach((f) => f());
}

/** Priority-ordered live activities: music (when it needs the pill) > important alerts >
 *  events starting soon > live games. `includeMusic` is false where the music card is already
 *  on screen (StandBy). */
export function useLiveActivities(includeMusic = true): LiveActivity[] {
  const [s, setS] = useState(snap);
  const np = useNowPlaying();

  useEffect(() => {
    listeners.add(setS);
    setS(snap);
    start();
    return () => {
      listeners.delete(setS);
      if (listeners.size === 0) stop();
    };
  }, []);

  const list: LiveActivity[] = [];
  // The next-event countdown lives in the top bar, so it is not a pill as well.
  list.push(...s.games);
  if (includeMusic && np?.connected && np.isPlaying && np.track) {
    list.push({
      id: `m-${np.track.id}`,
      kind: "music",
      priority: 110, // music in the pill outranks everything, alerts included
      color: "#f0b38a",
      title: np.track.name,
      subtitle: np.track.artists,
    });
  }
  return list.sort((a, b) => b.priority - a.priority);
}

/** Shared calendar, weather and device feeds (one poller for the whole page). */
export function useFeeds() {
  const [s, setS] = useState(snap);
  useEffect(() => {
    listeners.add(setS);
    setS(snap);
    start();
    return () => {
      listeners.delete(setS);
      if (listeners.size === 0) stop();
    };
  }, []);
  return { events: s.events, calendarConnected: s.calendarConnected, weather: s.weather, devices: s.devices };
}
