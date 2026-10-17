"use client";

import { useEffect, useRef, useState } from "react";

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
  /** set when Spotify could not be asked (rate limit, outage): the rest of the reply is empty and must not replace what's shown */
  error?: string;
  retryAfter?: number;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

// One shared poller per page — the island and the lyrics widget both read
// from it instead of each hitting the API (Spotify rate-limits hard).
// Adaptive: 30s while playing (plus a poll right as the track ends), 60s when idle — the
// progress bar is interpolated locally, so frequent polling buys nothing.
// The free hosting plan allows 1M requests a month in total, so these are deliberately lazy: taps update the screen
// instantly on their own (optimistic), and this only has to notice changes made elsewhere.
const PLAYING_MS = 10_000;
const IDLE_MS = 45_000;
/** After a tap, ignore polls that still show the old play/pause state (Spotify takes a moment to report it). */
let hold: { isPlaying: boolean; until: number } | null = null;
let latest: NowPlaying | null = null;
const listeners = new Set<(d: NowPlaying) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let backoffUntil = 0;

export async function pollOnce() {
  if (typeof document !== "undefined" && document.hidden) return;
  try {
    const sent = Date.now();
    const res = await fetch("/api/spotify/now-playing", { cache: "no-store" });
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
      if (l?.track && l.isPlaying && l.fetchedAt && l.fetchedAt + (l.track.durationMs - l.track.progressMs) + 5000 < Date.now()) {
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

/** While the screen is dimmed nobody is watching the music card: check far less often. */
let dimmed = false;
export function setNowPlayingDimmed(v: boolean) {
  dimmed = v;
  if (!v) pollOnce(); // catch up the moment the screen wakes
}

function nextDelay(): number {
  if (Date.now() < backoffUntil) return Math.max(15_000, backoffUntil - Date.now());
  if (dimmed) return 20_000;
  const d = latest;
  if (!d?.connected || !d.isPlaying || !d.track) return IDLE_MS;
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
  if (!document.hidden && running) {
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
      loop();
    }
    return () => {
      listeners.delete(setData);
      if (listeners.size === 0 && running) {
        running = false;
        if (timer) clearTimeout(timer);
        timer = null;
        document.removeEventListener("visibilitychange", onVisible);
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
      setProgressMs(Math.min(track.durationMs, base + elapsed));
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

/** Playback command: the screen reacts immediately (play/pause flips, progress freezes), then confirms with quick polls. */
export async function controlSpotify(action: "play" | "pause" | "next" | "previous" | "volume", value?: number) {
  if (latest && (action === "play" || action === "pause")) {
    const playing = action === "play";
    const t = latest.track;
    const elapsed = latest.isPlaying ? Date.now() - (latest.fetchedAt ?? Date.now()) : 0;
    latest = {
      ...latest,
      isPlaying: playing,
      fetchedAt: Date.now(),
      track: t ? { ...t, progressMs: Math.min(t.durationMs, t.progressMs + elapsed) } : t,
    };
    hold = { isPlaying: playing, until: Date.now() + 3500 };
    listeners.forEach((fn) => fn(latest!));
  }
  try {
    await fetch("/api/spotify/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, value }),
    });
  } catch {
    // ignore: controls are best-effort
  }
  for (const ms of [350, 1000, 2200, 4000]) setTimeout(pollOnce, ms);
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
