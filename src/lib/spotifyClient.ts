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
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

// One shared poller per page — the island and the lyrics widget both read
// from it instead of each hitting the API (Spotify rate-limits hard).
// Adaptive: 30s while playing (plus a poll right as the track ends), 60s when idle — the
// progress bar is interpolated locally, so frequent polling buys nothing.
const PLAYING_MS = 30_000;
const IDLE_MS = 60_000;
let latest: NowPlaying | null = null;
const listeners = new Set<(d: NowPlaying) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export async function pollOnce() {
  if (typeof document !== "undefined" && document.hidden) return;
  try {
    const res = await fetch("/api/spotify/now-playing", { cache: "no-store" });
    if (!res.ok) return;
    latest = await res.json();
    listeners.forEach((fn) => fn(latest!));
  } catch {
    // keep last known value on a transient failure
  }
}

function nextDelay(): number {
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
    }, 200);
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

/** Fire-and-forget playback command, then re-poll so the UI catches up. */
export async function controlSpotify(action: "play" | "pause" | "next" | "previous" | "volume", value?: number) {
  try {
    await fetch("/api/spotify/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, value }),
    });
  } catch {
    // ignore: controls are best-effort
  }
  setTimeout(pollOnce, 600);
}
