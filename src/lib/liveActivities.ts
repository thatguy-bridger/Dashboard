"use client";

import { useEffect, useState } from "react";
import { useNowPlaying } from "@/lib/spotifyClient";

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

interface Snapshot {
  alerts: LiveActivity[];
  event: LiveActivity | null;
  game: LiveActivity | null;
}

// One shared poller per page (same pattern as spotifyClient): every consumer
// reads the same snapshot instead of each hitting the API.
let snap: Snapshot = { alerts: [], event: null, game: null };
const listeners = new Set<(s: Snapshot) => void>();
const timers: ReturnType<typeof setInterval>[] = [];

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
    publish({ alerts });
  } catch {
    // keep last
  }
}

async function pollCalendar() {
  try {
    const res = await fetch("/api/calendar", { cache: "no-store" });
    if (!res.ok) return;
    const { events } = await res.json();
    publish({ event: pickSoonEvent(events ?? []) });
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
  if (timers.length) return;
  pollNotifications();
  pollCalendar();
  pollGame();
  timers.push(setInterval(pollNotifications, 30_000), setInterval(pollCalendar, 3 * 60_000), setInterval(pollGame, 60_000));
}

function stop() {
  timers.splice(0).forEach(clearInterval);
}

/** Priority-ordered live activities: important alerts > events starting soon >
 *  live games > music. `includeMusic` is false where the music card is already
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

  const list: LiveActivity[] = [...s.alerts];
  if (s.event) list.push(s.event);
  if (s.game) list.push(s.game);
  if (includeMusic && np?.connected && np.isPlaying && np.track) {
    list.push({
      id: `m-${np.track.id}`,
      kind: "music",
      priority: 50,
      color: "#f0b38a",
      title: np.track.name,
      subtitle: np.track.artists,
    });
  }
  return list.sort((a, b) => b.priority - a.priority);
}
