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
  /** media: 0-100 */
  volume?: number | null;
  playing?: boolean;
  title?: string | null;
}

export interface HomeSnapshot {
  provider: "homeassistant" | "demo";
  entities: HomeEntity[];
}

export type HomeAction =
  | { type: "toggle" | "on" | "off" | "activate" | "play" | "pause" | "next" | "previous" }
  | { type: "brightness" | "volume"; value: number };

export interface HomeProvider {
  name: HomeSnapshot["provider"];
  snapshot(): Promise<HomeSnapshot>;
  act(id: string, action: HomeAction): Promise<void>;
}
