// One small stroke-icon set (24x24, currentColor, round caps), used everywhere instead of emoji. No font, no dependency.
export type IconName =
  | "sun" | "moon" | "cloud" | "cloud-sun" | "cloud-rain" | "snow" | "bolt" | "fog" | "thermometer"
  | "bulb" | "fan" | "speaker" | "play" | "pause" | "skip-back" | "skip-forward" | "note" | "backspace"
  | "home" | "walk" | "calendar" | "mail" | "book" | "car" | "battery" | "clock" | "users" | "bell" | "flame" | "check" | "school" | "pin" | "sparkle" | "chart" | "alert";

const S: Record<IconName, React.ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.8 6.8 0 0 0 9.7 9.7z" />,
  cloud: <path d="M7 18.5a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 9.8a4.4 4.4 0 0 1-.5 8.7z" />,
  "cloud-sun": <><circle cx="8" cy="8" r="2.6" /><path d="M8 2.6v1.2M2.6 8h1.2M4.2 4.2l.8.8M11.8 4.2l-.8.8" /><path d="M9.5 20a3.6 3.6 0 0 1-.5-7.1A5 5 0 0 1 18.6 14a3.1 3.1 0 0 1-.6 6z" /></>,
  "cloud-rain": <><path d="M7 15a4 4 0 0 1-.6-7.95A6 6 0 0 1 18 6.3 4.4 4.4 0 0 1 17.5 15z" /><path d="M8 18.5v2.2M12 18.5v2.2M16 18.5v2.2" /></>,
  snow: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 6.5l2.5-2M9.5 19.5L12 17.5l2.5 2" />,
  bolt: <path d="M13 2.5L4.5 13.5H11l-1 8L19.5 10H13z" />,
  fog: <path d="M4 8.5h16M3 12.5h14M6 16.5h15M8 20.5h8" />,
  thermometer: <path d="M10 14.4V5a2 2 0 0 1 4 0v9.4a4 4 0 1 1-4 0z" />,
  bulb: <path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" />,
  fan: <><circle cx="12" cy="12" r="1.7" /><path d="M12 10.3C12 6 10.3 3 8 3.4 6.2 3.8 6.6 7.4 10.5 10.7M13.7 12c4.3 0 7.3 1.7 6.9 4-.4 1.8-4 1.4-7.3-2.5M10.3 13.5c-2.2 3.7-1.8 7.1.4 7.4 1.9.3 2.7-3.2 1.2-7.6" /></>,
  speaker: <><rect x="6" y="2.5" width="12" height="19" rx="3" /><circle cx="12" cy="14.5" r="3.4" /><circle cx="12" cy="7" r="1" /></>,
  play: <path d="M7.5 4.5v15l12-7.5z" />,
  pause: <path d="M7 4.5h3.4v15H7zM13.6 4.5H17v15h-3.4z" />,
  "skip-back": <path d="M6 5v14M19 5.5v13L8.5 12z" />,
  "skip-forward": <path d="M18 5v14M5 5.5v13L15.5 12z" />,
  note: <><path d="M9 17.5V5.5l11-2v12" /><circle cx="6.5" cy="17.5" r="2.6" /><circle cx="17.5" cy="15.5" r="2.6" /></>,
  backspace: <path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12zM12.5 9.5l5 5M17.5 9.5l-5 5" />,
  home: <path d="M3 11l9-8 9 8M5.5 9.5V20h13V9.5M10 20v-6h4v6" />,
  walk: <><circle cx="13" cy="4.5" r="1.8" /><path d="M12 8.5l-2.4 4.2 3.2 2.3V20M12 8.5l3.2 3.6 2.3.4M9.6 12.7L7.5 16" /></>,
  calendar: <path d="M6 5h12a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 18 21H6a2.5 2.5 0 0 1-2.5-2.5v-11A2.5 2.5 0 0 1 6 5zM3.5 10h17M8 3v4M16 3v4" />,
  mail: <path d="M5.5 5.5h13A2.5 2.5 0 0 1 21 8v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16V8a2.5 2.5 0 0 1 2.5-2.5zM3.5 7.5l8.5 6 8.5-6" />,
  book: <path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10.5" />,
  car: <><path d="M4.5 15.5l1.6-5.2A2 2 0 0 1 8 9h8a2 2 0 0 1 1.9 1.3l1.6 5.2M3.5 15.5h17v3.2h-17zM7 18.7v1.8M17 18.7v1.8" /><circle cx="7.5" cy="14.2" r=".6" /><circle cx="16.5" cy="14.2" r=".6" /></>,
  battery: <><rect x="2.5" y="7.5" width="17" height="9" rx="2.5" /><path d="M21.7 10.5v3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19.5a6 6 0 0 1 12 0" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16.5 14.2a5 5 0 0 1 5 4.6" /></>,
  bell: <path d="M6 17.5v-6a6 6 0 0 1 12 0v6l1.7 2H4.3zM10 21.5h4" />,
  flame: <path d="M12 3c.9 4 5 5.3 5 10a5 5 0 0 1-10 0c0-2 .9-3.1 2-4 0 1.9.8 3 2 3 0-3.2-.2-6 1-9z" />,
  check: <path d="M5 12.5l4.6 4.6L19 7.5" />,
  school: <path d="M2.5 9L12 4.5 21.5 9 12 13.5zM6.5 11.3V16c0 1.4 2.5 2.8 5.5 2.8s5.5-1.4 5.5-2.8v-4.7M21.5 9v5" />,
  pin: <><path d="M12 21.5s7-6.1 7-11.7a7 7 0 0 0-14 0c0 5.6 7 11.7 7 11.7z" /><circle cx="12" cy="9.8" r="2.4" /></>,
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  alert: <path d="M12 3.5L2.8 19.5h18.4zM12 10v4.5M12 17.2v.2" />,
};
const FILLED: IconName[] = ["play", "pause", "skip-back", "skip-forward", "bolt"];

export function Icon({ name, size = "1em", className = "", level }: { name: IconName; size?: string; className?: string; level?: number }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" width={size} height={size} fill={FILLED.includes(name) ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="var(--icon-stroke, 1.75)" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {S[name]}
      {name === "battery" && level != null && <rect x="4.6" y="9.6" width={Math.max(0.5, 12.8 * Math.min(1, Math.max(0, level)))} height="4.8" rx="1" fill="currentColor" stroke="none" />}
    </svg>
  );
}

/** Weather code (Open-Meteo / WMO) to an icon. */
export function weatherIconName(code: number, night: boolean): IconName {
  if (code === 0) return night ? "moon" : "sun";
  if (code <= 2) return night ? "cloud" : "cloud-sun";
  if (code === 3) return "cloud";
  if (code >= 95) return "bolt";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 45 && code <= 48) return "fog";
  return "cloud-rain";
}
