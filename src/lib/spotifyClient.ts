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
  track: SpotifyTrack | null;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

export function useNowPlaying() {
  const [data, setData] = useState<NowPlaying | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/spotify/now-playing", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
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
