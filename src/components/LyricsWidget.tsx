"use client";

import { useEffect, useRef } from "react";
import type { WidgetSize } from "@/lib/presets";
import { useReportContent } from "@/lib/temporaryContent";
import { useNowPlaying, useEstimatedProgress, useLyrics, type LyricLine } from "@/lib/spotifyClient";

function LyricsPanel({ lines, progressMs }: { lines: LyricLine[]; progressMs: number }) {
  const activeRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  let activeIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= progressMs) activeIndex = i;
    else break;
  }

  useEffect(() => {
    // Scroll only our own container: scrollIntoView also scrolls every ancestor,
    // including the parent page when this runs inside a Control preview iframe.
    const sc = scroller.current, el = activeRef.current;
    if (!sc || !el) return;
    sc.scrollTo({ top: el.offsetTop - sc.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [activeIndex]);

  return (
    <div className="w-full flex-1 min-h-0 overflow-hidden relative">
      <div ref={scroller} className="absolute inset-0 overflow-y-auto scrollbar-none flex flex-col items-center gap-4 px-4 py-[45%] [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]">
        {lines.map((line, i) => {
          const active = i === activeIndex;
          return (
            <div
              key={i}
              ref={active ? activeRef : undefined}
              className={`text-center will-change-transform ${
                active
                  ? "text-2xl font-bold text-white opacity-100 scale-100 translate-y-0 transition-all duration-500 ease-out"
                  : "text-lg font-semibold text-white opacity-35 scale-95 transition-all duration-200 ease-in"
              }`}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Dedicated synced-lyrics panel — the now-playing "who's playing what" summary
 *  lives in the always-on SpotifyIsland instead; this is purely for the case
 *  where you want a big wall-sized lyrics-only tile. */
export function LyricsWidget({ size = "lg" }: { size?: WidgetSize }) {
  const data = useNowPlaying();
  const track = data?.track ?? null;
  const progressMs = useEstimatedProgress(track, data?.isPlaying ?? false, data?.fetchedAt);
  const lyrics = useLyrics(track);

  useReportContent(Boolean(data?.isPlaying && track));

  if (!data) return <div className="text-sm text-[var(--muted)]">Loading…</div>;
  if (!data.connected) return <div className="text-sm text-[var(--muted)]">Spotify not connected</div>;
  if (!track) return <div className="text-sm text-[var(--muted)]">Nothing playing</div>;

  const big = size === "lg" || size === "xl";

  return (
    <div className="flex flex-col items-center gap-3 w-full h-full">
      <div className="flex items-center gap-3 w-full shrink-0">
        {track.albumArtUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external Spotify CDN image
          <img
            src={track.albumArtUrl}
            alt=""
            className={`${big ? "w-14 h-14" : "w-10 h-10"} rounded-lg object-cover shrink-0`}
          />
        )}
        <div className="min-w-0">
          <div className={`${big ? "text-lg" : "text-sm"} font-bold truncate`}>{track.name}</div>
          <div className="text-xs text-[var(--muted)] truncate">{track.artists}</div>
        </div>
      </div>
      {lyrics === null ? (
        <div className="text-sm text-[var(--muted)] flex-1 flex items-center">Loading lyrics…</div>
      ) : lyrics.length === 0 ? (
        <div className="text-sm text-[var(--muted)] flex-1 flex items-center">No synced lyrics found</div>
      ) : (
        <LyricsPanel lines={lyrics} progressMs={progressMs} />
      )}
    </div>
  );
}
