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
const POLL_MS = 10_000;
let latest: NowPlaying | null = null;
const listeners = new Set<(d: NowPlaying) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

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

export function useNowPlaying() {
  const [data, setData] = useState<NowPlaying | null>(latest);

  useEffect(() => {
    listeners.add(setData);
    if (latest) setData(latest);
    if (!timer) {
      pollOnce();
      timer = setInterval(pollOnce, POLL_MS);
    }
    return () => {
      listeners.delete(setData);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
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
