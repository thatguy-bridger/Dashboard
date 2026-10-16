/** One thing on the touch screen: a light/switch, a scene button, or a speaker/TV. */
export type HomeKind = "light" | "switch" | "scene" | "media";

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
}

export const EMPTY_HOME_CONFIG: HomeConfig = { hidden: [], rooms: {}, names: {}, scenes: [] };

export type HomeAction =
  | { type: "toggle" | "on" | "off" | "activate" | "play" | "pause" | "next" | "previous" }
  | { type: "brightness" | "volume" | "colorTemp"; value: number }
  | { type: "color"; h: number; s: number };

export interface HomeProvider {
  name: HomeSnapshot["provider"];
  snapshot(): Promise<HomeSnapshot>;
  act(id: string, action: HomeAction): Promise<void>;
}
