"use client";

import { useEffect, useRef, useState } from "react";
import { useNowPlaying } from "@/lib/spotifyClient";
import { useArtTheme } from "@/lib/useArtTheme";
import { useLiveActivities, type ActivityKind, type LiveActivity } from "@/lib/liveActivities";
import { Marquee } from "@/components/Marquee";
import { NotificationTicker } from "@/components/NotificationTicker";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const pill = "relative flex items-center rounded-full overflow-hidden shrink-0";
// Clear glass, matching the top-bar chips (flat gradient + hairline, no black fill, no live blur).
const pillStyle = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.06))",
  border: "1px solid rgba(255,255,255,0.12)",
} as const;

const initials = (n: string) => n.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(-1)[0]?.slice(0, 3).toUpperCase() ?? "";

function Logo({ src, name }: { src: string | null; name: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- external team badge
    <img src={src} alt={name} className="w-7 h-7 object-contain shrink-0" />
  ) : (
    <span className="w-7 text-center text-[11px] font-bold text-white/70 shrink-0">{initials(name)}</span>
  );
}

function GamePill({ a }: { a: LiveActivity }) {
  const g = a.game!;
  return (
    <div className={`${pill} gap-3 px-4`} style={{ ...pillStyle, height: 46 }}>
      <Logo src={g.awayBadge} name={g.away} />
      <span className="num-rounded font-bold text-white" style={{ fontSize: 20 }}>{g.awayScore}</span>
      <span className="text-white/35 font-bold">–</span>
      <span className="num-rounded font-bold text-white" style={{ fontSize: 20 }}>{g.homeScore}</span>
      <Logo src={g.homeBadge} name={g.home} />
      <span className="text-white/50 font-semibold whitespace-nowrap" style={{ fontSize: 12 }}>{g.status}</span>
    </div>
  );
}

/** Music: art + title; for the first 10 seconds of a new song it opens up to show the artist. */
function MusicPill({ a }: { a: LiveActivity }) {
  const np = useNowPlaying();
  const track = np?.track ?? null;
  const { accent } = useArtTheme(track?.albumArtUrl);
  const [open, setOpen] = useState(false);
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!track || track.id === last.current) return;
    last.current = track.id;
    setOpen(true);
    const t = setTimeout(() => setOpen(false), 10_000);
    return () => clearTimeout(t);
  }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on id so polls don't reset the timer

  if (!track) return null;
  return (
    <div className="relative min-w-0" style={{ flex: "0 1 auto" }}>
      <div
        className="absolute pointer-events-none"
        style={{
          inset: "-60px -90px -80px -90px",
          background: `radial-gradient(ellipse 50% 50% at 50% 45%, ${accent}55 0%, ${accent}22 45%, transparent 100%)`,
        }}
      />
      <div
        className={`${pill} gap-3 pl-2 pr-5 min-w-0`}
        // Width is whatever the title needs (no minimum), up to a cap so the other pills still fit.
        style={{ ...pillStyle, height: open ? 58 : 46, maxWidth: open ? 300 : 230, transition: `height 0.4s ${EASE}, max-width 0.4s ${EASE}` }}
      >
        {track.albumArtUrl && (
          // A little record: the art spins while playing (paused when not), with fine grooves, a bright
          // sheen that stays still as the label turns, and a centre spindle hole.
          <div
            className="relative shrink-0 rounded-full"
            style={{ width: open ? 42 : 34, height: open ? 42 : 34, boxShadow: `0 2px 12px ${accent}66`, transition: `all 0.4s ${EASE}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external Spotify CDN image */}
            <img
              src={track.albumArtUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover rounded-full"
              style={{ animation: "vinyl-spin 7s linear infinite", animationPlayState: np?.isPlaying ? "running" : "paused" }}
            />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0 1.5px, rgba(0,0,0,0.16) 1.5px 2.5px), conic-gradient(from 35deg, transparent 0 18%, rgba(255,255,255,0.28) 24%, transparent 30% 68%, rgba(255,255,255,0.18) 74%, transparent 80%)",
              }}
            />
            <div className="absolute rounded-full bg-black/80" style={{ inset: "38%", boxShadow: "0 0 0 1px rgba(255,255,255,0.25)" }} />
            <div className="absolute rounded-full bg-white/60" style={{ inset: "46%" }} />
          </div>
        )}
        <div className="min-w-0">
          <Marquee className="text-white font-semibold text-[14px]">{a.title}</Marquee>
          <div className="text-white/55 font-medium truncate overflow-hidden" style={{ fontSize: 12, maxHeight: open ? 18 : 0, opacity: open ? 1 : 0, transition: "all 0.4s" }}>
            {track.artists}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Top-centre pills: music, alerts and live scores, each its own flexible pill. Anything a visible
 *  widget already shows is passed in `hide` so the same content never appears twice. */
export function ActivityPills({ hide = [] as ActivityKind[], includeMusic = true }: { hide?: ActivityKind[]; includeMusic?: boolean }) {
  const activities = useLiveActivities(includeMusic).filter((a) => !hide.includes(a.kind));
  if (activities.length === 0) return null;
  // The centre lane between the top-bar groups: one row, and the flexible pills (music title, notification
  // ticker) shrink to share it, so nothing wraps down over content or leaves the screen. Every alert shares ONE pill that scrolls through them.
  const alerts = activities.filter((a) => a.kind === "alert");
  const others = activities.filter((a) => a.kind !== "alert");
  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-nowrap items-start justify-center gap-3"
      style={{ width: "min(560px, calc(100vw - 40px))" }}
    >
      {others.map((a) => (a.kind === "music" ? <MusicPill key={a.id} a={a} /> : <GamePill key={a.id} a={a} />))}
      {alerts.length > 0 && <NotificationTicker items={alerts.map((a) => ({ id: a.id, message: a.title, color: a.color }))} />}
    </div>
  );
}
