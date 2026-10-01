"use client";

import { useEffect, useMemo, useState } from "react";
import { PALETTES, speedToSeconds, type BackgroundConfig } from "@/lib/background";

const DIRECTION_ANGLES: Record<BackgroundConfig["direction"], number> = {
  diagonal: 135,
  horizontal: 90,
  vertical: 180,
  radial: 0,
};

/** Deterministic-ish float layout for blobs so the same config always looks the same. */
function blobLayout(count: number) {
  const layout: { top: string; left: string; size: number; delay: number }[] = [];
  for (let i = 0; i < count; i++) {
    const seed = (i * 53 + 7) % 97;
    layout.push({
      top: `${(seed * 3.1) % 90}%`,
      left: `${(seed * 5.7) % 90}%`,
      size: 32 + ((seed * 13) % 40),
      delay: (i * 1.7) % 6,
    });
  }
  return layout;
}

function useWeatherCondition() {
  const [state, setState] = useState<{ isDay: boolean; weatherCode: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/weather")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && data) setState({ isDay: data.isDay, weatherCode: data.weatherCode });
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return state;
}

function weatherPalette(weatherCode: number, isDay: boolean): keyof typeof PALETTES {
  if (!isDay) return "midnight";
  if (weatherCode === 0) return "citrus"; // clear
  if (weatherCode <= 3) return "aurora"; // partly cloudy
  if (weatherCode >= 51 && weatherCode <= 67) return "ocean"; // rain
  if (weatherCode >= 71 && weatherCode <= 77) return "arctic"; // snow
  if (weatherCode >= 95) return "ember"; // storms
  return "slate";
}

function BlobLayer({ palette, count, speed, dim }: { palette: string[]; count: number; speed: number; dim: number }) {
  const blobs = useMemo(() => blobLayout(count), [count]);
  return (
    <>
      {blobs.map((b, i) => (
        <div
          key={i}
          className="bg-blob"
          style={{
            top: b.top,
            left: b.left,
            width: `${b.size}vmax`,
            height: `${b.size}vmax`,
            background: palette[i % palette.length],
            animationDuration: speed > 0 ? `${speed}s` : undefined,
            animationDelay: `${b.delay}s`,
            animationPlayState: speed > 0 ? "running" : "paused",
          }}
        />
      ))}
      {dim > 0 && <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${dim})` }} />}
    </>
  );
}

function StaticGradient({ config }: { config: BackgroundConfig }) {
  const colors = PALETTES[config.palette];
  const angle = DIRECTION_ANGLES[config.direction];
  const background =
    config.direction === "radial"
      ? `radial-gradient(circle at 30% 30%, ${colors.join(", ")})`
      : `linear-gradient(${angle}deg, ${colors.join(", ")})`;
  return (
    <>
      <div className="absolute inset-0" style={{ background }} />
      {config.dim > 0 && <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${config.dim})` }} />}
    </>
  );
}

function BackgroundLayer({ config }: { config: BackgroundConfig }) {
  const weather = useWeatherCondition();
  const speedSec = speedToSeconds(config.speed);

  switch (config.mode) {
    case "solid":
      return <div className="absolute inset-0" style={{ background: PALETTES[config.palette][0] }} />;

    case "gradient":
      return <StaticGradient config={config} />;

    case "image":
      return (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: config.imageUrl ? `url(${config.imageUrl})` : undefined, background: config.imageUrl ? undefined : PALETTES[config.palette][0] }}
          />
          {config.dim > 0 && <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${config.dim})` }} />}
        </>
      );

    case "colorBlur":
      return (
        <>
          <div className="absolute inset-0" style={{ background: PALETTES[config.palette][0] }} />
          <BlobLayer palette={[...PALETTES[config.palette]]} count={config.blobCount} speed={speedSec} dim={config.dim} />
        </>
      );

    case "weatherBlur": {
      const p = weather ? weatherPalette(weather.weatherCode, weather.isDay) : config.palette;
      return (
        <>
          <div className="absolute inset-0 transition-colors duration-[3000ms]" style={{ background: PALETTES[p][0] }} />
          <BlobLayer palette={[...PALETTES[p]]} count={config.blobCount} speed={speedSec || 24} dim={config.dim} />
        </>
      );
    }

    case "musicBlur":
      // No live audio source is wired up yet — renders as an energetic animated
      // blur so the screen still feels alive; swap the palette per-track once
      // a now-playing integration exists.
      return (
        <>
          <div className="absolute inset-0" style={{ background: PALETTES[config.palette][0] }} />
          <BlobLayer palette={[...PALETTES[config.palette]]} count={config.blobCount} speed={speedSec || 6} dim={config.dim} />
        </>
      );

    case "rotate":
      return <RotatingBackground config={config} />;

    default:
      return null;
  }
}

function RotatingBackground({ config }: { config: BackgroundConfig }) {
  const configs = config.rotation?.configs ?? [];
  const intervalSec = config.rotation?.intervalSec ?? 60;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (configs.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % configs.length), intervalSec * 1000);
    return () => clearInterval(id);
  }, [configs.length, intervalSec]);

  if (configs.length === 0) return null;
  return (
    <div className="absolute inset-0" key={index} style={{ animation: "bg-fade-in 1.5s ease" }}>
      <BackgroundLayer config={configs[index]} />
    </div>
  );
}

export function ScreenBackground({
  config,
  fixed = true,
}: {
  config: BackgroundConfig;
  /** false embeds the background inside its own positioned container (e.g. the grid editor)
   *  instead of pinning it to the viewport. */
  fixed?: boolean;
}) {
  return (
    <div className={`${fixed ? "fixed" : "absolute"} inset-0 -z-10 overflow-hidden`}>
      <BackgroundLayer config={config} />
    </div>
  );
}
