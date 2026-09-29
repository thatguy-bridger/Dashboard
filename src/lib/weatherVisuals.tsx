// Apple Weather's real trick isn't the icon set, it's that the whole card's
// background shifts with condition + time of day. This mirrors that: a
// gradient token and a minimal line-icon per WMO code group, instead of
// pulling in an icon font/library for a handful of shapes.

export type WeatherGroup =
  | "clear"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "showers"
  | "thunder";

export function weatherGroup(code: number): WeatherGroup {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 55) return "drizzle";
  if (code >= 61 && code <= 65) return "rain";
  if (code >= 71 && code <= 75) return "snow";
  if (code >= 80 && code <= 82) return "showers";
  if (code >= 95) return "thunder";
  return "cloudy";
}

/** Two stops, light-to-dark, applied as a diagonal gradient behind the card. */
export function weatherGradient(code: number, isDay: boolean): [string, string] {
  const group = weatherGroup(code);
  if (!isDay) {
    switch (group) {
      case "clear":
        return ["#0b1230", "#1a2456"];
      case "thunder":
        return ["#100c22", "#2a1b4a"];
      default:
        return ["#12161f", "#232a3a"];
    }
  }
  switch (group) {
    case "clear":
      return ["#2a8fd8", "#7fc7f0"];
    case "cloudy":
      return ["#5c6b82", "#8a97ab"];
    case "fog":
      return ["#6b7382", "#9198a6"];
    case "drizzle":
    case "rain":
    case "showers":
      return ["#3c5470", "#5f7996"];
    case "snow":
      return ["#7591ab", "#c7d6e6"];
    case "thunder":
      return ["#2c2d45", "#4b4a6b"];
  }
}

/** "Image mode"'s answer for weather: since there's no free photo API worth
 * pulling a stock photo from per condition, this renders a living CSS
 * effect instead — drifting clouds, falling rain, a glowing sun — layered
 * behind the card content. Purely decorative, absolutely positioned,
 * pointer-events-none. */
export function WeatherEffect({ code, isDay }: { code: number; isDay: boolean }) {
  const group = weatherGroup(code);

  if (group === "clear" && isDay) {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-60 animate-[sun-pulse_6s_ease-in-out_infinite]"
          style={{ background: "radial-gradient(circle, #fff8d6, transparent 70%)" }}
        />
      </div>
    );
  }

  if (group === "rain" || group === "drizzle" || group === "showers" || group === "thunder") {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-px h-6 bg-white/40 animate-[rain-fall_1s_linear_infinite]"
            style={{
              left: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 10) * 0.1}s`,
              animationDuration: `${0.7 + (i % 5) * 0.1}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (group === "snow") {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-white/70 animate-[snow-fall_4s_linear_infinite]"
            style={{
              left: `${(i * 53) % 100}%`,
              animationDelay: `${(i % 9) * 0.4}s`,
              animationDuration: `${3 + (i % 4)}s`,
            }}
          />
        ))}
      </div>
    );
  }

  if (group === "cloudy" || group === "fog") {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/10 blur-md animate-[cloud-drift_20s_linear_infinite]"
            style={{
              width: `${60 + i * 20}px`,
              height: `${24 + i * 8}px`,
              top: `${15 + i * 25}%`,
              animationDelay: `${i * -7}s`,
            }}
          />
        ))}
      </div>
    );
  }

  return null;
}

function IconBase({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

/** One icon per condition group, day/night aware only for "clear" (sun vs
 * crescent moon) since that's the only case where it visually matters. */
export function WeatherIcon({ code, isDay, className }: { code: number; isDay: boolean; className?: string }) {
  const group = weatherGroup(code);
  const cls = className ?? "w-16 h-16";

  switch (group) {
    case "clear":
      return isDay ? (
        <IconBase className={cls}>
          <circle cx="12" cy="12" r="4.5" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line key={deg} x1="12" y1="2.5" x2="12" y2="5" transform={`rotate(${deg} 12 12)`} />
          ))}
        </IconBase>
      ) : (
        <IconBase className={cls}>
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
        </IconBase>
      );
    case "cloudy":
      return (
        <IconBase className={cls}>
          <path d="M6.5 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 16.8 8.2 4.5 4.5 0 0 1 16.5 18h-10Z" />
        </IconBase>
      );
    case "fog":
      return (
        <IconBase className={cls}>
          <path d="M6.5 13a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 16.3 4.5" />
          <line x1="3" y1="16" x2="21" y2="16" />
          <line x1="5" y1="19" x2="19" y2="19" />
        </IconBase>
      );
    case "drizzle":
    case "rain":
    case "showers":
      return (
        <IconBase className={cls}>
          <path d="M6.5 14a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 16.8 4.2 4.5 4.5 0 0 1 16.5 14h-10Z" />
          <line x1="8" y1="17" x2="7" y2="20" />
          <line x1="12" y1="17" x2="11" y2="20" />
          <line x1="16" y1="17" x2="15" y2="20" />
        </IconBase>
      );
    case "snow":
      return (
        <IconBase className={cls}>
          <path d="M6.5 12a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 16.8 2.2 4.5 4.5 0 0 1 16.5 12h-10Z" />
          <line x1="8" y1="16" x2="8" y2="20" />
          <line x1="12" y1="16" x2="12" y2="20" />
          <line x1="16" y1="16" x2="16" y2="20" />
          <line x1="6.5" y1="18" x2="9.5" y2="18" />
          <line x1="10.5" y1="18" x2="13.5" y2="18" />
          <line x1="14.5" y1="18" x2="17.5" y2="18" />
        </IconBase>
      );
    case "thunder":
      return (
        <IconBase className={cls}>
          <path d="M6.5 12a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 16.8 2.2 4.5 4.5 0 0 1 16.5 12h-10Z" />
          <path d="M13 15l-3 4h3l-2 4" />
        </IconBase>
      );
  }
}
