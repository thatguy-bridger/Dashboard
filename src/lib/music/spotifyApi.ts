import { d1Query } from "@/lib/d1";
import { getValidSpotifyToken } from "@/lib/spotify";

/** The only door to Spotify. Spotify locks the whole app out (for up to hours) once it gets too many requests, and every
 *  server instance used to find that out for itself. Here the lock-out is kept in the database, so the moment ANY request is
 *  refused, everything else stops asking until it is over. Requests also carry their own token and are counted. */
const BLOCK_KEY = "spotifyBlock";
let blockCache: { at: number; until: number } | null = null;
const recent: number[] = [];

export async function spotifyBlockedUntil(): Promise<number> {
  if (blockCache && Date.now() - blockCache.at < 2500) return blockCache.until;
  let until = 0;
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [BLOCK_KEY]);
    until = Number(rows[0]?.value) || 0;
  } catch { /* unknown: assume free */ }
  blockCache = { at: Date.now(), until };
  return until;
}

async function noteBlock(retrySeconds: number) {
  const until = Date.now() + Math.max(5, retrySeconds) * 1000;
  blockCache = { at: Date.now(), until };
  await d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [BLOCK_KEY, String(until)]).catch(() => {});
}

/** How many requests this server instance sent to Spotify in the last minute (for the debug view). */
export const spotifyCallsLastMinute = () => recent.filter((t) => t > Date.now() - 60_000).length;

/** A synthetic reply for "we are not allowed to ask right now", so callers handle it like any refusal. */
const refused = (status: number, retry?: number) =>
  new Response(JSON.stringify({ error: { status, message: status === 429 ? "blocked" : "not connected" } }), { status, headers: retry ? { "retry-after": String(retry) } : {} });

/** fetch() for api.spotify.com/v1/<path>: adds the token, respects the shared lock-out, records a new one. */
export async function spotifyFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const blocked = await spotifyBlockedUntil();
  if (blocked > Date.now()) return refused(429, Math.ceil((blocked - Date.now()) / 1000));
  const token = await getValidSpotifyToken();
  if (!token) return refused(401);
  recent.push(Date.now());
  while (recent.length > 200) recent.shift();
  const res = await fetch(`https://api.spotify.com/v1/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });
  if (res.status === 429) await noteBlock(Number(res.headers.get("retry-after")) || 60);
  return res;
}
