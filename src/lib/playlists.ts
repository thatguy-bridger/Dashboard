// What Permuta sends so the page can start music: state:playlists {items:[{id,uri,name,image,count?}]}, state:speakers {items:[{name}]},
// state:music_error {message, at}. Everything is optional and parsed defensively.
export type Playlist = { id: string; uri: string; name: string; image?: string; count?: number };

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function parsePlaylists(raw: unknown): Playlist[] {
  return list(obj(raw)?.items).flatMap((x) => { const o = obj(x); const id = str(o?.id), uri = str(o?.uri), name = str(o?.name); return o && id && uri && name ? [{ id, uri, name, image: str(o.image), count: typeof o.count === "number" ? o.count : undefined }] : []; });
}
export function parseSpeakers(raw: unknown): string[] {
  return list(obj(raw)?.items).flatMap((x) => { const n = str(obj(x)?.name); return n ? [n] : []; });
}
/** The most recent "couldn't start" message, only if it's newer than `sinceSec` (epoch seconds). */
export function musicError(raw: unknown, sinceSec: number): string | null {
  const o = obj(raw); const m = str(o?.message); const at = typeof o?.at === "number" ? o.at : 0;
  return m && at >= sinceSec ? m : null;
}
/** The command the page sends to start something. */
export const playCommand = (uri: string | null, speaker: string) => (uri ? { action: "play", uri, speaker } : { action: "resume", speaker });
