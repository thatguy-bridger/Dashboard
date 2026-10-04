"use client";

import { useEffect, useRef, useState } from "react";
import { useNowPlaying, useEstimatedProgress } from "@/lib/spotifyClient";
import { useArtTheme } from "@/lib/useArtTheme";

const COLLAPSED = { width: 210, height: 46, radius: 23, art: 30 };
const EXPANDED = { width: 380, height: 112, radius: 34, art: 80 };
const EXPANDED_HOLD_MS = 10_000;

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Islet-style now-playing island: pure black (fuses with the screen edge),
 *  expands for a new track, then settles to album art + title. Accent comes
 *  from the artwork; nothing bounces (smooth 0.4s). */
export function SpotifyIsland() {
  const data = useNowPlaying();
  const track = data?.track ?? null;
  const { accent } = useArtTheme(track?.albumArtUrl);
  const progress = useEstimatedProgress(track, data?.isPlaying ?? false, data?.fetchedAt);
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
    // Keyed on the id, not the object: each poll yields a new object and would
    // otherwise clear the collapse timer before it fires.
  }, [track?.id]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!data?.connected || !data.isPlaying || !track) return null;

  const dims = expanded ? EXPANDED : COLLAPSED;
  const pct = track.durationMs ? Math.min(100, (progress / track.durationMs) * 100) : 0;
  const ease = "cubic-bezier(0.32, 0.72, 0, 1)";

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div
        className="relative bg-black overflow-hidden"
        style={{
          width: dims.width,
          height: dims.height,
          borderRadius: dims.radius,
          transition: `width 0.4s ${ease}, height 0.4s ${ease}, border-radius 0.4s ${ease}`,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.12), 0 10px 40px -8px ${accent}66`,
        }}
      >
        {/* tint wash from the artwork's accent */}
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            opacity: expanded ? 1 : 0.5,
            background: `radial-gradient(ellipse at 20% 0%, ${accent}40, transparent 70%)`,
          }}
        />
        <div className="relative h-full flex items-center gap-3" style={{ padding: expanded ? "16px 20px" : "8px 14px" }}>
          {track.albumArtUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- external Spotify CDN image
            <img
              src={track.albumArtUrl}
              alt=""
              className="object-cover shrink-0"
              style={{
                width: dims.art,
                height: dims.art,
                borderRadius: expanded ? dims.art * 0.25 : 9999,
                boxShadow: `0 4px 18px ${accent}66`,
                transition: `all 0.4s ${ease}`,
              }}
            />
          )}
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <div className={`truncate text-white ${expanded ? "text-lg font-bold" : "text-[0.8125rem] font-semibold"}`}>
              {track.name}
            </div>
            <div
              className="text-sm font-medium text-white/60 truncate overflow-hidden transition-all duration-500"
              style={{ maxHeight: expanded ? 24 : 0, opacity: expanded ? 1 : 0 }}
            >
              {track.artists}
            </div>
            <div
              className="overflow-hidden transition-all duration-500"
              style={{ maxHeight: expanded ? 24 : 0, opacity: expanded ? 1 : 0, marginTop: expanded ? 10 : 0 }}
            >
              <div className="h-1.5 rounded-full bg-white/18 overflow-hidden" style={{ background: "rgba(255,255,255,0.18)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}a6, ${accent})` }}
                />
              </div>
              <div className="flex justify-between text-[10px] num-rounded font-semibold text-white/45 mt-1">
                <span>{fmt(progress)}</span>
                <span>{fmt(track.durationMs)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
