"use client";

import { useEffect, useRef, useState } from "react";
import { useNowPlaying } from "@/lib/spotifyClient";

const COLLAPSED = { width: 190, height: 46, radius: 9999, art: 28 };
const EXPANDED = { width: 340, height: 92, radius: 26, art: 64 };
const EXPANDED_HOLD_MS = 10_000;

/** iPhone Dynamic-Island-style now-playing overlay — always on when Spotify
 *  is connected and something is playing, independent of whatever widgets
 *  are on the current preset. Expands full-size for a new track, then
 *  settles down to a small album-art + title pill. */
export function SpotifyIsland() {
  const data = useNowPlaying();
  const track = data?.track ?? null;
  const [expanded, setExpanded] = useState(false);
  const lastTrackId = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!track) {
      lastTrackId.current = null;
      return;
    }
    if (track.id === lastTrackId.current) return;
    lastTrackId.current = track.id;

    setExpanded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setExpanded(false), EXPANDED_HOLD_MS);
    // Deliberately keyed on the id, not the track object — a new poll produces a
    // new object every ~5s even when the song hasn't changed, and re-running this
    // effect on every poll would clear the collapse timer before it ever fires.
  }, [track?.id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!data?.connected || !data.isPlaying || !track) return null;

  const dims = expanded ? EXPANDED : COLLAPSED;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div
        className="bg-black/70 backdrop-blur-xl border border-white/10 overflow-hidden flex items-center transition-all duration-500 ease-out shadow-2xl"
        style={{
          width: dims.width,
          height: dims.height,
          borderRadius: dims.radius,
          padding: expanded ? "12px 18px" : "8px 14px",
        }}
      >
        {track.albumArtUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external Spotify CDN image
          <img
            src={track.albumArtUrl}
            alt=""
            className="object-cover shrink-0 transition-all duration-500 ease-out"
            style={{ width: dims.art, height: dims.art, borderRadius: expanded ? 12 : 9999 }}
          />
        )}
        <div className="ml-3 min-w-0 flex flex-col justify-center overflow-hidden">
          <div
            className={`truncate text-white transition-all duration-500 ${
              expanded ? "text-base font-semibold" : "text-xs font-medium"
            }`}
          >
            {track.name}
          </div>
          {expanded && <div className="text-sm text-white/60 truncate">{track.artists}</div>}
        </div>
      </div>
    </div>
  );
}
