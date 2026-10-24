"use client";

import { useEffect, useRef, useState } from "react";
import { isDormant, onWake } from "@/lib/dormant";

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string;
  album: string;
  albumArtUrl: string | null;
  durationMs: number;
  progressMs: number;
}

export interface NowPlaying {
  connected: boolean;
  isPlaying: boolean;
  fetchedAt?: number;
  volumePercent?: number | null;
  track: SpotifyTrack | null;
  /** what is playing it: Spotify on a speaker, or another app straight from the speaker */
  origin?: { app: string; speaker: string; entity: string | null } | null;
  /** the next songs in the queue, known ahead of time by the music brain */
  next?: { id: string; name: string; artists: string; art: string | null }[];
  /** where the music brain got this from, and its version (changes whenever anything does) */
  source?: "spotify" | "speaker" | "estimate" | "idle";
  seq?: number;
  /** the "Music lights" scene as the music brain has it */
  lights?: { enabled: boolean; ids: string[]; modes: Record<string, "color" | "on" | "off">; /** the apps are offering to turn the music lights on (evening, music just started, lights on) */ suggest?: boolean };
  /** set when Spotify could not be asked (rate limit, outage): the rest of the reply is empty and must not replace what's shown */
  error?: string;
  retryAfter?: number;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

// One shared poller per page. It reads the music brain's record (/api/music/state); the screens never ask Spotify
// themselves. The brain is updated every few seconds by Home Assistant, so this only has to pick that up.
// The free hosting plan allows 1M requests a month in total, so these are deliberately lazy: taps update the screen
// instantly on their own (optimistic, and the command's reply carries the new record), and a poll lands right as a song ends.
const PLAYING_MS = 8_000;
const IDLE_MS = 45_000;
/** After a tap, ignore polls that still show the old play/pause state (Spotify takes a moment to report it). */
let hold: { isPlaying: boolean; until: number } | null = null;
let latest: NowPlaying | null = null;
const listeners = new Set<(d: NowPlaying) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let backoffUntil = 0;
let unwake: () => void = () => {};

export async function pollOnce() {
  if (isDormant()) return; // nobody is using the screen: no questions to the server until it wakes
  try {
    const sent = Date.now();
    const res = await fetch("/api/music/state", { cache: "no-store" });
    if (!res.ok) return;
    const received = Date.now();
    const next = (await res.json()) as NowPlaying & { serverNow?: number };
    // Put the moment Spotify measured the position on this screen's own clock: assume the reply took half the
    // round trip, and correct for the server's clock differing from this one.
    if (typeof next.serverNow === "number" && next.fetchedAt) next.fetchedAt = next.fetchedAt - (next.serverNow - (sent + received) / 2);
    if (next.error) {
      // Spotify couldn't be asked: keep showing the last song (until its estimated end) instead of blanking every screen
      backoffUntil = Date.now() + Math.min(Math.max(next.retryAfter ?? 30, 30), 300) * 1000;
      const l = latest;
      if (l?.track && l.track.durationMs > 0 && l.isPlaying && l.fetchedAt && l.fetchedAt + (l.track.durationMs - l.track.progressMs) + 5000 < Date.now()) {
        latest = { ...l, isPlaying: false, track: null };
        listeners.forEach((fn) => fn(latest!));
      }
      return;
    }
    backoffUntil = 0;
    if (hold && Date.now() < hold.until && next.isPlaying !== hold.isPlaying) return;
    latest = next;
    listeners.forEach((fn) => fn(latest!));
  } catch {
    // keep last known value on a transient failure
  }
}


function nextDelay(): number {
  if (Date.now() < backoffUntil) return Math.max(15_000, backoffUntil - Date.now());
  const d = latest;
  if (!d?.connected || !d.isPlaying || !d.track) return IDLE_MS;
  if (d.track.durationMs <= 0) return PLAYING_MS; // no known end (radio, streams)
  const elapsed = Date.now() - (d.fetchedAt ?? Date.now());
  const untilEnd = d.track.durationMs - d.track.progressMs - elapsed + 1500;
  return Math.max(3000, Math.min(PLAYING_MS, untilEnd));
}

function loop() {
  if (!running) return;
  pollOnce().finally(() => {
    if (running) timer = setTimeout(loop, nextDelay());
  });
}

// A tab that was hidden skips polls; catch up the moment it's visible again.
function onVisible() {
  if (!isDormant() && running) {
    if (timer) clearTimeout(timer);
    loop();
  }
}

export function useNowPlaying() {
  const [data, setData] = useState<NowPlaying | null>(latest);

  useEffect(() => {
    listeners.add(setData);
    if (latest) setData(latest);
    if (!running) {
      running = true;
      document.addEventListener("visibilitychange", onVisible);
      unwake = onWake(onVisible);
      loop();
    }
    return () => {
      listeners.delete(setData);
      if (listeners.size === 0 && running) {
        running = false;
        if (timer) clearTimeout(timer);
        timer = null;
        document.removeEventListener("visibilitychange", onVisible);
        unwake();
      }
    };
  }, []);

  return data;
}

/** Interpolates playback position between polls (Apple-Music-style smooth sync)
 *  instead of jumping only every 5s when the server is actually re-fetched. */
export function useEstimatedProgress(track: SpotifyTrack | null, isPlaying: boolean, fetchedAt: number | undefined) {
  const [progressMs, setProgressMs] = useState(track?.progressMs ?? 0);

  useEffect(() => {
    if (!track) return;
    setProgressMs(track.progressMs);
    if (!isPlaying) return;
    const base = track.progressMs;
    const start = fetchedAt ?? Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgressMs(track.durationMs > 0 ? Math.min(track.durationMs, base + elapsed) : base + elapsed);
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs when track/fetchedAt change, not every render
  }, [track?.id, track?.progressMs, isPlaying, fetchedAt]);

  return progressMs;
}

export function useLyrics(track: SpotifyTrack | null) {
  const [lines, setLines] = useState<LyricLine[] | null>(null);
  const lastTrackId = useRef<string | null>(null);

  useEffect(() => {
    if (!track) return;
    if (track.id === lastTrackId.current) return;
    lastTrackId.current = track.id;
    setLines(null);

    const params = new URLSearchParams({
      track: track.name,
      artist: track.artists.split(",")[0].trim(),
      album: track.album,
      durationMs: String(track.durationMs),
    });
    fetch(`/api/spotify/lyrics?${params}`)
      .then((res) => res.json())
      .then((data) => setLines(data.synced ?? null))
      .catch(() => setLines(null));
  }, [track]);

  return lines;
}

/** Playback command: the screen reacts immediately (play/pause flips, progress freezes), the music brain updates the shared record
 *  and answers with it, then a couple of quick reads confirm. */
export async function controlSpotify(action: "play" | "pause" | "next" | "previous" | "volume", value?: number) {
  if (latest && (action === "play" || action === "pause")) {
    const playing = action === "play";
    const t = latest.track;
    const elapsed = latest.isPlaying ? Date.now() - (latest.fetchedAt ?? Date.now()) : 0;
    latest = {
      ...latest,
      isPlaying: playing,
      fetchedAt: Date.now(),
      track: t ? { ...t, progressMs: t.durationMs > 0 ? Math.min(t.durationMs, t.progressMs + elapsed) : t.progressMs + elapsed } : t,
    };
    hold = { isPlaying: playing, until: Date.now() + 3500 };
    listeners.forEach((fn) => fn(latest!));
  }
  try {
    const sent = Date.now();
    const res = await fetch("/api/music/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, value }),
    });
    const j = (await res.json().catch(() => null)) as { now?: NowPlaying & { serverNow?: number } } | null;
    if (j?.now && action !== "volume") {
      const next = j.now;
      if (typeof next.serverNow === "number" && next.fetchedAt) next.fetchedAt = next.fetchedAt - (next.serverNow - (sent + Date.now()) / 2);
      latest = { ...next, lights: latest?.lights ?? next.lights };
      listeners.forEach((fn) => fn(latest!));
    }
  } catch {
    // ignore: controls are best-effort
  }
  for (const ms of [900, 2500]) setTimeout(pollOnce, ms);
}

/** Spotify briefly reports "nothing playing" between songs (and during ads). Reading that straight
 *  made the backdrop and pills drop out for a moment, which showed up as a black flash. This keeps
 *  "playing" true, and keeps the last album art, for `holdMs` after the last real playing state. */
export function useStickyPlaying(np: NowPlaying | null, holdMs = 8000): { playing: boolean; artUrl: string | null } {
  const raw = Boolean(np?.connected && np.isPlaying && np.track);
  const lastArt = useRef<string | null>(null);
  if (raw) lastArt.current = np?.track?.albumArtUrl ?? lastArt.current;
  const [held, setHeld] = useState(raw);

  useEffect(() => {
    if (raw) {
      setHeld(true);
      return;
    }
    const t = setTimeout(() => setHeld(false), holdMs);
    return () => clearTimeout(t);
  }, [raw, holdMs]);

  const playing = raw || held;
  return { playing, artUrl: playing ? lastArt.current : null };
}
