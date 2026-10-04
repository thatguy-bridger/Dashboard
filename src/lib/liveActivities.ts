"use client";

import { useEffect, useState } from "react";
import { useNowPlaying } from "@/lib/spotifyClient";
import { pollEvery } from "@/lib/poll";

export type ActivityKind = "alert" | "event" | "game" | "music";

export interface LiveActivity {
  id: string;
  kind: ActivityKind;
  /** Higher wins the island. */
  priority: number;
  color: string;
  title: string;
  subtitle?: string;
}

export interface FeedNote { id: string; message: string; level: string; source: string | null; read: boolean }
export interface FeedEvent { summary: string; start: string; end?: string; allDay: boolean; source: string; colorId: string | null }

interface Snapshot {
  alerts: LiveActivity[];
  event: LiveActivity | null;
  game: LiveActivity | null;
  /** Raw feeds, shared so StandBy doesn't poll the same endpoints a second time. */
  notes: FeedNote[] | null;
  events: FeedEvent[] | null;
  calendarConnected: boolean;
}

// One shared poller per page (same pattern as spotifyClient): every consumer
// reads the same snapshot instead of each hitting the API.
let snap: Snapshot = { alerts: [], event: null, game: null, notes: null, events: null, calendarConnected: false };
const listeners = new Set<(s: Snapshot) => void>();
const stops: (() => void)[] = [];

function publish(patch: Partial<Snapshot>) {
  snap = { ...snap, ...patch };
  listeners.forEach((fn) => fn(snap));
}

async function pollNotifications() {
  try {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    if (!res.ok) return;
    const { notifications } = await res.json();
    const alerts: LiveActivity[] = (notifications as { id: string; message: string; level: string; read: boolean; source: string | null }[])
      .filter((n) => !n.read && (n.level === "important" || n.level === "action_needed"))
      .map((n) => ({
        id: `n-${n.id}`,
        kind: "alert" as const,
        priority: n.level === "important" ? 100 : 90,
        color: n.level === "important" ? "#ff6b6b" : "#ffb84d",
        title: n.message,
        subtitle: n.source ?? "Claude",
      }));
    publish({ alerts, notes: notifications });
  } catch {
    // keep last
  }
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

async function pollGame() {
  try {
    const res = await fetch("/api/sports?mode=live", { cache: "no-store" });
    if (!res.ok) return;
    const { live } = await res.json();
    publish({
      game: live
        ? {
            id: `g-${live.away}-${live.home}`,
            kind: "game",
            priority: 70,
            color: "#34d399",
            title: `${live.away} ${live.awayScore} – ${live.homeScore} ${live.home}`,
            subtitle: `${live.league} · ${live.status}`,
          }
        : null,
    });
  } catch {
    // keep last
  }
}

function start() {
  if (stops.length) return;
  pollNotifications();
  pollCalendar();
  pollGame();
  stops.push(pollEvery(pollNotifications, 2 * 60_000), pollEvery(pollCalendar, 5 * 60_000), pollEvery(pollGame, 5 * 60_000));
}

function stop() {
  stops.splice(0).forEach((f) => f());
}

/** Notifications surface routinely instead of all the time: open for `holdMs` whenever the set
 *  of notifications changes (something new), then again every `everyMs`. */
export function useRoutine(key: string, everyMs = 8 * 60_000, holdMs = 20_000): boolean {
  const [open, setOpen] = useState(Boolean(key));
  useEffect(() => {
    if (!key) {
      setOpen(false);
      return;
    }
    setOpen(true);
    let hide = setTimeout(() => setOpen(false), holdMs);
    const iv = setInterval(() => {
      setOpen(true);
      hide = setTimeout(() => setOpen(false), holdMs);
    }, everyMs);
    return () => {
      clearTimeout(hide);
      clearInterval(iv);
    };
  }, [key, everyMs, holdMs]);
  return open;
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

  const alertsOpen = useRoutine(s.alerts.map((a) => a.id).join(","));
  const list: LiveActivity[] = alertsOpen ? [...s.alerts] : [];
  if (s.event) list.push(s.event);
  if (s.game) list.push(s.game);
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

/** Shared notification + calendar feeds (one poller for the whole page). */
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
  return { notes: s.notes, events: s.events, calendarConnected: s.calendarConnected };
}
