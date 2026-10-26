/** One thing on the touch screen: a light/switch, a scene button, or a speaker/TV. */
export type HomeKind = "light" | "switch" | "scene" | "media" | "fan" | "display";

export interface HomeEntity {
  id: string;
  name: string;
  kind: HomeKind;
  room: string;
  available: boolean;
  /** light / switch / media power */
  on?: boolean;
  /** 0-100, only for dimmable lights */
  brightness?: number;
  dimmable?: boolean;
  /** Colour temperature in kelvin (warm ~2200 to cool ~6500), for lights that support it. */
  colorTemp?: number;
  minKelvin?: number;
  maxKelvin?: number;
  /** [hue 0-360, saturation 0-100] for lights that support colour. */
  hs?: [number, number];
  supportsColorTemp?: boolean;
  supportsColor?: boolean;
  /** fan: current speed 0-100 and how many discrete speeds it has (e.g. 6) */
  speed?: number;
  speedSteps?: number;
  /** media: 0-100 */
  volume?: number | null;
  playing?: boolean;
  title?: string | null;
  /** true for scenes saved in this dashboard (as opposed to Home Assistant's own) */
  custom?: boolean;
}

export interface HomeSnapshot {
  provider: "homeassistant" | "demo";
  entities: HomeEntity[];
  /** "I'm leaving" was run and the lights haven't been restored yet */
  away?: boolean;
  /** timers still running (entity id -> end time and action) */
  timers?: Record<string, DeviceTimer>;
  /** guest mode: in force while the owner is away (unless unlocked with the PIN) */
  /** the morning wake-up settings */
  morning?: MorningConfig;
  guest?: { active: boolean; mode: "auto" | "on" | "off"; ownerAway: boolean; overrideUntil: number };
  /** entity ids flagged to stay on when "All lights" is turned off */
  keepOn?: string[];
  /** Home Assistant people (phones) and whether each is home, when it has any */
  people?: { name: string; home: boolean }[];
}

/** What a saved scene sets on one light. */
export interface SceneLight {
  on: boolean;
  brightness?: number;
  colorTemp?: number;
  hs?: [number, number];
}

export interface SavedScene {
  id: string;
  name: string;
  lights: Record<string, SceneLight>;
}

/** Dashboard-side tweaks layered over whatever the provider reports. */
export interface HomeConfig {
  /** entity ids to leave off the touch screen */
  hidden: string[];
  /** entity id -> room name (overrides Home Assistant's area) */
  rooms: Record<string, string>;
  /** entity id -> display name */
  names: Record<string, string>;
  scenes: SavedScene[];
  /** lights/switches that the big "All lights" off leaves alone (and "I'm leaving" keeps on) */
  keepOn: string[];
  /** running "turn off/on in N minutes" timers: entity id -> when (ms) and what */
  timers: Record<string, DeviceTimer>;
  morning: MorningConfig;
}

/** The morning wake-up: a sunrise on the lights, then fan, music and the tablet. Home Assistant runs the schedule. */
export interface MorningConfig {
  enabled: boolean;
  /** "07:00" */
  time: string;
  /** 0 = Sunday ... 6 = Saturday */
  days: number[];
  /** how long the lights take to come up */
  minutes: number;
  /** which lights; empty = all of them */
  lightIds: string[];
  music: boolean;
  /** speaker volume when the music starts (0-100) */
  volume: number;
  /** fan speed (0-100) part-way through, or null to leave the fan alone */
  fanSpeed: number | null;
  /** wake the tablet screen at the start */
  tablet: boolean;
}

export const DEFAULT_MORNING: MorningConfig = { enabled: false, time: "07:00", days: [1, 2, 3, 4, 5], minutes: 15, lightIds: [], music: true, volume: 25, fanSpeed: null, tablet: true };

export interface DeviceTimer {
  endsAt: number;
  action: "on" | "off";
}

export const EMPTY_HOME_CONFIG: HomeConfig = { hidden: [], rooms: {}, names: {}, scenes: [], keepOn: [], timers: {}, morning: DEFAULT_MORNING };

export type HomeAction =
  | { type: "toggle" | "on" | "off" | "activate" | "play" | "pause" | "next" | "previous" }
  | { type: "brightness" | "volume" | "colorTemp" | "speed"; value: number }
  | { type: "color"; h: number; s: number; /** optional brightness 1-100 sent in the same command */ brightness?: number };

export interface HomeProvider {
  name: HomeSnapshot["provider"];
  snapshot(): Promise<HomeSnapshot>;
  act(id: string, action: HomeAction): Promise<void>;
  /** Same action on several devices; providers may batch it into fewer calls. */
  actMany?(ids: string[], action: HomeAction): Promise<void>;
  /** Save what is on, turn everything off, and remember it so `returnHome` can bring it back. */
  leaveHome?(keepOn?: string[]): Promise<void>;
  /** Start (or replace) a turn-on/off timer on one device; it keeps counting inside the home system. */
  startTimer?(id: string, minutes: number, action: "on" | "off"): Promise<void>;
  /** Play a timed plan on one light from the home system's side (each step at its time, in seconds after the plan starts), replacing any plan already running there. */
  fade?(id: string, frames: { data?: Record<string, unknown>; off?: boolean; at: number }[]): Promise<void>;
  stopFade?(id: string): Promise<void>;
  cancelTimer?(id: string): Promise<void>;
  returnHome?(): Promise<void>;
  /** Fresh state for just these devices (cheap: used to confirm a change landed). */
  peek(ids: string[]): Promise<HomeEntity[]>;
}
