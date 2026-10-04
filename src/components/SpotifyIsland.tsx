"use client";

import { FitText } from "@/components/FitText";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNowPlaying, useEstimatedProgress, useLyrics } from "@/lib/spotifyClient";
import { useArtTheme } from "@/lib/useArtTheme";
import { useLiveActivities, type LiveActivity } from "@/lib/liveActivities";
import { Marquee } from "@/components/Marquee";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const HOLD_MS = 10_000;

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** One continuous lyric strip: current line white, others 35%, the current line
 *  anchored at a fixed fraction across the card and eased into place. */
function LyricTicker({ progressMs, trackId }: { progressMs: number; trackId: string }) {
  const lines = useLyricsFor(trackId);
  const wrap = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const [shift, setShift] = useState(0);

  let active = -1;
  if (lines) for (let i = 0; i < lines.length; i++) if (lines[i].timeMs <= progressMs) active = i;

  useEffect(() => {
    const el = refs.current[active];
    const w = wrap.current;
    if (!el || !w) return;
    setShift(w.clientWidth * 0.3 - (el.offsetLeft + el.offsetWidth / 2) + w.clientWidth * 0.2);
  }, [active, lines]);

  if (!lines || lines.length === 0) return null;
  return (
    <div
      ref={wrap}
      className="relative overflow-hidden h-6 w-full"
      style={{ maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)" }}
    >
      <div
        ref={strip}
        className="absolute left-0 top-0 whitespace-nowrap flex gap-6"
        style={{ transform: `translateX(${shift}px)`, transition: "transform 0.8s cubic-bezier(0.32,0.72,0,1)" }}
      >
        {lines.map((l, i) => (
          <span
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="text-sm font-bold transition-colors duration-[400ms]"
            style={{ color: i === active ? "#fff" : "rgba(255,255,255,0.35)" }}
          >
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function useLyricsFor(_trackId: string) {
  const np = useNowPlaying();
  return useLyrics(np?.track ?? null);
}

function ActivityPill({ a, expanded }: { a: LiveActivity; expanded: boolean }) {
  return (
    <div className="relative h-full flex items-center gap-3 px-5">
      <div
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: a.color, boxShadow: `0 0 10px ${a.color}` }}
      />
      <div className="min-w-0 flex-1">
        {expanded ? (
          <FitText lines={2} className="text-white text-base font-bold leading-tight">{a.title}</FitText>
        ) : (
          <Marquee className="text-white text-[0.8125rem] font-semibold">{a.title}</Marquee>
        )}
        {a.subtitle && (
          <div
            className="text-xs font-semibold text-white/55 truncate overflow-hidden transition-all duration-500"
            style={{ maxHeight: expanded ? 20 : 0, opacity: expanded ? 1 : 0 }}
          >
            {a.subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

/** Islet-style island driven by prioritized Live Activities: the top activity
 *  owns the island, the next one sits beside it as a satellite circle. A new
 *  top activity expands for 10s, then settles. Pure black with a rim on the
 *  left/bottom/right (never the top). */
export function SpotifyIsland({ includeMusic = true }: { includeMusic?: boolean }) {
  const activities = useLiveActivities(includeMusic);
  const top = activities[0] ?? null;
  const next = activities[1] ?? null;

  const np = useNowPlaying();
  const track = top?.kind === "music" ? np?.track ?? null : null;
  const { accent } = useArtTheme(track?.albumArtUrl);
  const progress = useEstimatedProgress(track, np?.isPlaying ?? false, np?.fetchedAt);
  const color = top?.kind === "music" ? accent : top?.color ?? "#fff";

  const [expanded, setExpanded] = useState(false);
  const lastId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!top) {
      lastId.current = null;
      return;
    }
    if (top.id === lastId.current) return;
    lastId.current = top.id;
    setExpanded(true);
    if (timer.current) clearTimeout(timer.current);
    // Alerts stay expanded until dismissed elsewhere; everything else settles.
    timer.current = setTimeout(() => setExpanded(false), top.kind === "alert" ? HOLD_MS * 2 : HOLD_MS);
  }, [top?.id, top?.kind]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const dims = useMemo(() => {
    const music = top?.kind === "music";
    return expanded
      ? { w: music ? 400 : 420, h: music ? 128 : 84, r: music ? 34 : 38, art: 84 }
      : { w: music ? 220 : 260, h: 46, r: 23, art: 30 };
  }, [expanded, top?.kind]);

  if (!top) return null;
  const pct = track?.durationMs ? Math.min(100, (progress / track.durationMs) * 100) : 0;

  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex items-start gap-2">
      <div
        className="relative bg-black overflow-hidden"
        style={{
          width: dims.w,
          height: dims.h,
          borderRadius: `0 0 ${dims.r}px ${dims.r}px`,
          transition: `width 0.4s ${EASE}, height 0.4s ${EASE}, border-radius 0.4s ${EASE}`,
          // black rim on left, bottom and right — never the top
          boxShadow: `0 0 0 2.5px #000, 0 12px 40px -10px ${color}66`,
          clipPath: "inset(0 -20px -20px -20px)",
        }}
      >
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{ opacity: expanded ? 1 : 0.5, background: `radial-gradient(ellipse at 20% 0%, ${color}40, transparent 70%)` }}
        />
        {top.kind === "music" && track ? (
          <div className="relative h-full flex items-center gap-3" style={{ padding: expanded ? "14px 20px" : "8px 16px" }}>
            {track.albumArtUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external Spotify CDN image
              <img
                src={track.albumArtUrl}
                alt=""
                className="object-cover shrink-0"
                style={{
                  width: dims.art, height: dims.art, borderRadius: expanded ? dims.art * 0.25 : 9999,
                  boxShadow: `0 4px 18px ${accent}66`, transition: `all 0.4s ${EASE}`,
                }}
              />
            )}
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <Marquee className={`text-white ${expanded ? "text-lg font-bold" : "text-[0.8125rem] font-semibold"}`}>{track.name}</Marquee>
              <div
                className="overflow-hidden transition-all duration-500"
                style={{ maxHeight: expanded ? 80 : 0, opacity: expanded ? 1 : 0 }}
              >
                <FitText className="text-sm font-medium text-white/60">{track.artists}</FitText>
                <div className="mt-1.5"><LyricTicker progressMs={progress} trackId={track.id} /></div>
                <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.18)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}a6, ${accent})` }} />
                </div>
                <div className="flex justify-between text-[10px] num-rounded font-semibold text-white/45 mt-0.5">
                  <span>{fmt(progress)}</span><span>{fmt(track.durationMs)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <ActivityPill a={top} expanded={expanded} />
        )}
      </div>

      {next && (
        <div
          className="mt-0 w-[46px] h-[46px] rounded-full bg-black flex items-center justify-center"
          style={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.12), 0 0 14px ${next.color}66` }}
          title={next.title}
        >
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: next.color, boxShadow: `0 0 8px ${next.color}` }} />
        </div>
      )}
    </div>
  );
}
