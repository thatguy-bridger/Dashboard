import type { Ev, SceneConfig } from "./scenes";
import type { ThemeConfig } from "./theme";
import type { PulseConfig } from "./pulse";
import type { Lyrics } from "./lyrics";
import type { SlotItem } from "./slots";

export type { Ev };
export type NextTrack = { id?: string; track: string; artist?: string; art?: string; duration?: number; palette?: string[]; lyricsId?: string };
export type LightsState = { on: boolean; lights: { id: string; name: string; mode: string; color?: string }[] };
export type Music = { trackId?: string; palette?: string[]; playing: boolean; track: string; artist: string; artists?: string[]; album?: string; art?: string; progress: number; duration: number; at: number; device?: string; volume?: number; next?: NextTrack };
export type Weather = { current?: { temperature_2m: number; weather_code: number; is_day?: number }; daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[] } };
export type FocusConfig = { focusThreshold?: number; calmAfterSec?: number; pageSec?: number };
export type ScreenConfig = SceneConfig & PulseConfig & FocusConfig & { widgets?: string[]; accent?: string; name?: string; hideRooms?: string[]; defaultSpeaker?: string; visibleSpeakers?: string[]; hours24?: boolean; pageRules?: Record<string, number[]> };
export type ScreenData = {
  screen: ScreenConfig | null; theme: ThemeConfig | null;
  agenda: { events: Ev[] } | null; music: Music | null; status: { away?: boolean; at?: number } | null;
  location?: { lat: number; lon: number; name?: string } | null;
  weather: Weather | null; updatedAt: string | null; now: number;
  lyrics?: Lyrics | null;                     // state:lyrics
  lyricsNext?: Lyrics | null;                 // state:lyrics_next (the next song's lines, for the rollover)
  lights?: LightsState | null;                // state:lights (the music-lights indicator)
  info?: SlotItem[];                          // state:info: extra items for the zones, as Permuta wants them
  extra?: Record<string, unknown>;            // every other state:* row (school, mail, journal, car, battery, life …), parsed by its source
};
