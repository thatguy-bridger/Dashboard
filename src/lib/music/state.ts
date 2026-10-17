import { d1Query } from "@/lib/d1";

export interface MusicTrack {
  id: string;
  name: string;
  artists: string;
  album: string;
  albumArtUrl: string | null;
  durationMs: number;
}

export interface NextTrack {
  id: string;
  name: string;
  artists: string;
  art: string | null;
  durationMs: number;
  /** colours of the cover, worked out ahead of time when the lights need them */
  palette?: string[];
  mono?: boolean;
}

/** What the lights are doing for the song that is playing (so a new plan is only made when something really changed). */
export interface LightsRun {
  trackId: string;
  /** everything the plan depends on besides the song itself (modes, the next song): a change means a new plan */
  key: string;
  /** the plan is running in Home Assistant */
  active: boolean;
  /** where the song was (ms) at `at` (server clock), to tell whether playback drifted from the plan (skip, seek) */
  pos0: number;
  at: number;
  /** the lights the plan drives */
  ids: string[];
}

export interface MusicState {
  connected: boolean;
  isPlaying: boolean;
  track: MusicTrack | null;
  /** playback position at `positionAt` (server clock, ms) */
  progressMs: number;
  positionAt: number;
  volumePercent: number | null;
  device: { id: string; name: string } | null;
  next: NextTrack[];
  /** colours of the current cover (lights) */
  palette: { trackId: string; colors: string[]; mono: boolean } | null;
  /** when the queue was last read */
  queueAt: number;
  /** where the answer came from: the Spotify API, a speaker (Home Assistant), an estimate while Spotify is locked out, or nothing playing */
  source: "spotify" | "speaker" | "estimate" | "idle";
  /** the speakers disagreed with Spotify about playing on the last update (needs two in a row to count) */
  doubt?: boolean;
  error?: string;
  blockedUntil?: number;
  updatedAt: number;
  spotifyAt: number;
  seq: number;
  lights: LightsRun | null;
}

export const EMPTY_STATE: MusicState = {
  connected: true, isPlaying: false, track: null, progressMs: 0, positionAt: 0, volumePercent: null, device: null,
  next: [], palette: null, queueAt: 0, source: "idle", updatedAt: 0, spotifyAt: 0, seq: 0, lights: null,
};

const KEY = "musicState";

export async function loadState(): Promise<MusicState> {
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [KEY]);
    if (rows[0]?.value) return { ...EMPTY_STATE, ...JSON.parse(rows[0].value) };
  } catch { /* first run or database hiccup */ }
  return { ...EMPTY_STATE };
}

export async function saveState(s: MusicState): Promise<MusicState> {
  const next = { ...s, seq: s.seq + 1, updatedAt: Date.now() };
  await d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [KEY, JSON.stringify(next)]);
  return next;
}

/** Where the song is right now, from the last measurement. */
export const positionNow = (s: MusicState, now = Date.now()): number =>
  s.track ? Math.max(0, Math.min(s.track.durationMs, s.progressMs + (s.isPlaying ? now - s.positionAt : 0))) : 0;

/** The shape the screens already understand. */
export function toNowPlaying(s: MusicState) {
  return {
    connected: s.connected,
    isPlaying: s.isPlaying,
    fetchedAt: s.positionAt,
    volumePercent: s.volumePercent,
    track: s.track ? { ...s.track, progressMs: s.progressMs } : null,
    next: s.next.slice(0, 3).map((n) => ({ id: n.id, name: n.name, artists: n.artists, art: n.art })),
    source: s.source,
    ...(s.error ? { error: s.error } : {}),
    ...(s.blockedUntil && s.blockedUntil > Date.now() ? { retryAfter: Math.ceil((s.blockedUntil - Date.now()) / 1000) } : {}),
    seq: s.seq,
    serverNow: Date.now(),
  };
}
