import type { WidgetType } from "@/lib/presets";

type IconProps = { className?: string };

function ClockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2" />
      <path d="M16 9v7l5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WeatherIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="12" cy="12" r="5" fill="currentColor" opacity="0.9" />
      <path
        d="M10 22h11a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 9.2 15.1 4 4 0 0 0 10 22Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WorldClocksIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2" />
      <ellipse cx="16" cy="16" rx="5" ry="12" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 16h24M6.5 9.5h19M6.5 22.5h19" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function NewsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect x="5" y="7" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M23 12h4v10a2.5 2.5 0 0 1-2.5 2.5H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 11.5h9M9 15.5h9M9 19.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SportsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2" />
      <path
        d="M16 5v22M5 16h22M9 8.5c3 2.5 11 2.5 14 0M9 23.5c3-2.5 11-2.5 14 0"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function TrafficIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <path
        d="M9 27c-1-6 1-11 5-14M23 27c1-6-1-11-5-14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="9" cy="27" r="2" fill="currentColor" />
      <circle cx="23" cy="27" r="2" fill="currentColor" />
    </svg>
  );
}

function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect x="5" y="7" width="22" height="19" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 12.5h22M10.5 4v6M21.5 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="9.5" y="16" width="4" height="4" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function GenericTileIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect x="5" y="5" width="22" height="22" rx="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="4" fill="currentColor" />
    </svg>
  );
}

const ICONS: Record<WidgetType, (props: IconProps) => React.JSX.Element> = {
  clock: ClockIcon,
  weather: WeatherIcon,
  worldclocks: WorldClocksIcon,
  news: NewsIcon,
  sports: SportsIcon,
  calendar: CalendarIcon,
  traffic: TrafficIcon,
  locations: GenericTileIcon,
  gmail: GenericTileIcon,
  drive: GenericTileIcon,
  photos: GenericTileIcon,
  trafficcamera: GenericTileIcon,
  countdown: GenericTileIcon,
  airquality: GenericTileIcon,
  history: GenericTileIcon,
  stocks: GenericTileIcon,
  radar: GenericTileIcon,
  notifications: GenericTileIcon,
  lyrics: GenericTileIcon,
};

export function WidgetIcon({ type, className = "w-6 h-6" }: { type: WidgetType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={className} />;
}
