import { after } from "next/server";
import { haConfigured } from "@/lib/smarthome";
import { speakerStates, type SpeakerInfo } from "@/lib/smarthome/homeAssistant";
import { artPalette, loadLightsCfg, syncLights } from "@/lib/music/lights";
import { spotifyBlockedUntil, spotifyFetch } from "@/lib/music/spotifyApi";
import { loadState, positionNow, saveState, type MusicState, type MusicTrack, type NextTrack } from "@/lib/music/state";

/** The music brain. Home Assistant nudges `tick()` every few seconds (and the moment a speaker changes song); it is the ONLY
 *  thing that polls Spotify. It cross-checks Spotify against what the speakers themselves report, works out the queue, and
 *  keeps one record that every screen reads. Commands go through `command()`, which updates that record straight away. */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const QUEUE_EVERY_MS = 45_000;
const IDLE_ASK_MS = 30_000;

interface SpotifyPlayer {
  is_playing?: boolean;
  progress_ms?: number;
  item?: { id: string; type: string; name: string; duration_ms: number; artists: { name: string }[]; album: { name: string; images?: { url: string }[] } } | null;
  device?: { id: string; name: string; volume_percent?: number | null } | null;
}

const trackOf = (item: NonNullable<SpotifyPlayer["item"]>): MusicTrack => ({
  id: item.id, name: item.name, artists: item.artists.map((a) => a.name).join(", "), album: item.album.name,
  albumArtUrl: item.album.images?.[0]?.url ?? null, durationMs: item.duration_ms,
});

async function readQueue(): Promise<NextTrack[] | null> {
  const res = await spotifyFetch("me/player/queue");
  if (!res.ok) return null;
  const j = (await res.json()) as { queue?: { id: string; name: string; duration_ms: number; artists?: { name: string }[]; album?: { images?: { url: string }[] } }[] };
  return (j.queue ?? []).slice(0, 3).map((t) => ({
    id: t.id, name: t.name, artists: (t.artists ?? []).map((a) => a.name).join(", "), art: t.album?.images?.[0]?.url ?? null, durationMs: t.duration_ms,
  }));
}

/** Speakers that are playing Spotify right now. */
const spotifySpeakers = (sp: SpeakerInfo[]) => sp.filter((s) => s.state === "playing" && (!s.app || /spotify/i.test(s.app)) && s.title);

/** Asks Spotify and fuses the answer with the speakers. `force` skips the idle shortcut. */
export async function tick(opts: { force?: boolean } = {}): Promise<MusicState> {
  const now = Date.now();
  const prev = await loadState();
  if (!opts.force && now - prev.updatedAt < 900) return prev; // several speakers change at once: one update is enough
  const [speakers, blocked, cfg] = await Promise.all([
    haConfigured() ? speakerStates().catch(() => [] as SpeakerInfo[]) : Promise.resolve([] as SpeakerInfo[]),
    spotifyBlockedUntil(),
    loadLightsCfg(),
  ]);
  const playingNow = spotifySpeakers(speakers);
  const s: MusicState = { ...prev, blockedUntil: blocked > now ? blocked : undefined, error: undefined };

  const shouldAsk = opts.force || prev.isPlaying || playingNow.length > 0 || now - prev.spotifyAt > IDLE_ASK_MS;
  let asked = false;
  if (shouldAsk && blocked <= now) {
    const sent = Date.now();
    const res = await spotifyFetch("me/player?additional_types=track");
    asked = true;
    if (res.status === 401) { s.connected = false; s.isPlaying = false; s.track = null; s.source = "idle"; }
    else if (res.status === 429) { s.error = "rate limited by Spotify"; s.blockedUntil = await spotifyBlockedUntil(); }
    else if (res.status === 204 || res.status === 404) { s.connected = true; s.spotifyAt = Date.now(); s.isPlaying = false; s.source = "idle";
      // between songs Spotify can briefly say "nothing"; only a lasting nothing clears the song
      if (!(prev.isPlaying && now - prev.spotifyAt < 20_000)) { s.track = null; s.next = []; s.progressMs = 0; }
    }
    else if (!res.ok) s.error = "spotify request failed";
    else {
      const d = (await res.json()) as SpotifyPlayer;
      s.connected = true;
      s.spotifyAt = Date.now();
      if (d.item && d.item.type === "track") {
        s.track = trackOf(d.item);
        s.isPlaying = Boolean(d.is_playing);
        s.progressMs = d.progress_ms ?? 0;
        s.positionAt = Math.round((sent + Date.now()) / 2); // Spotify measured it somewhere between asking and answering
        s.device = d.device ? { id: d.device.id, name: d.device.name } : null;
        s.volumePercent = d.device?.volume_percent ?? s.volumePercent;
        s.source = "spotify";
      } else { s.isPlaying = false; s.source = "idle"; }
    }
  }

  // ---- cross-checks against the speakers ----
  if (s.track) {
    const mine = s.device ? speakers.filter((x) => norm(x.name) === norm(s.device!.name)) : [];
    const heard = mine.find((x) => x.state === "playing") ?? playingNow[0];
    if (asked && s.source === "spotify") {
      // 1. Spotify says playing, the speaker it plays on says it stopped: the speaker knows first (Spotify lags a few seconds after a pause).
      //    (It has to be true on two updates in a row, so a speaker that is just slow to start after Play doesn't make the screens flicker.)
      s.doubt = false;
      if (s.isPlaying && mine.length && mine.every((x) => ["paused", "idle", "off", "standby"].includes(x.state))) {
        if (prev.doubt) { s.isPlaying = false; s.source = "speaker"; } else s.doubt = true;
      }
      // 2. The speaker already moved on to the song that was queued next, but Spotify still shows the old one: take the queued song.
      if (heard && s.isPlaying && norm(heard.title) !== norm(s.track.name) && s.track.id === prev.track?.id) {
        const q = prev.next.find((n) => norm(n.name) === norm(heard.title));
        if (q) {
          s.track = { id: q.id, name: q.name, artists: q.artists, album: s.track.album, albumArtUrl: q.art, durationMs: q.durationMs };
          s.progressMs = heard.positionMs != null && heard.at != null ? heard.positionMs + (now - heard.at) : 0;
          s.positionAt = now;
          s.source = "speaker";
        }
      }
    }
    // Spotify couldn't be asked (locked out / failed): keep going from an estimate, corrected by what the speakers report.
    if (!asked || s.error) {
      if (prev.isPlaying && prev.track) {
        const stillPlaying = !speakers.length || playingNow.some((x) => norm(x.title) === norm(prev.track!.name) || prev.next.some((n) => norm(n.name) === norm(x.title)));
        if (!stillPlaying) { s.isPlaying = false; s.source = "speaker"; }
        else {
          const pos = positionNow(prev, now);
          if (pos >= prev.track.durationMs - 300 && prev.next[0]) {
            const n = prev.next[0];
            s.track = { id: n.id, name: n.name, artists: n.artists, album: prev.track.album, albumArtUrl: n.art, durationMs: n.durationMs };
            s.progressMs = 0; s.positionAt = now; s.next = prev.next.slice(1);
          }
          if (s.error || !asked) s.source = "estimate";
        }
      }
    }
  }
  // ---- queue and covers, ahead of time ----
  const songChanged = s.track?.id !== prev.track?.id;
  if (s.track && s.isPlaying && blocked <= now && (songChanged || (asked && now - s.queueAt > QUEUE_EVERY_MS) || (!s.next.length && now - s.queueAt > 20_000))) {
    const q = await readQueue();
    if (q) { s.next = q; s.queueAt = now; }
  } else if (songChanged) {
    // promote what we already knew was next
    s.next = prev.next.filter((n) => n.id !== s.track?.id);
  }
  if (cfg.enabled && s.track) {
    const art = s.track.albumArtUrl;
    if (art && s.palette?.trackId !== s.track.id) {
      const p = await artPalette(art);
      s.palette = p ? { trackId: s.track.id, colors: p.colors, mono: p.mono } : null;
    }
    const n = s.next[0];
    if (n?.art && !n.palette) {
      const p = await artPalette(n.art);
      if (p) s.next = s.next.map((x, i) => (i === 0 ? { ...x, palette: p.colors, mono: p.mono } : x));
    }
  }

  // ---- the lights ----
  s.lights = await syncLights(s, cfg, now);
  return saveState(s);
}

export type Command = "play" | "pause" | "next" | "previous" | "volume";

/** A playback command: the shared record changes at once (so every screen reacts together), then Spotify is told, then a quick
 *  extra update confirms what really happened. */
export async function command(action: Command, value?: number): Promise<{ state: MusicState; ok: boolean; status?: number }> {
  const now = Date.now();
  const prev = await loadState();
  const s: MusicState = { ...prev };
  if (action === "play" || action === "pause") {
    s.progressMs = positionNow(prev, now);
    s.positionAt = now;
    s.isPlaying = action === "play";
  } else if (action === "next" && prev.next[0] && prev.track) {
    const n = prev.next[0];
    s.track = { id: n.id, name: n.name, artists: n.artists, album: prev.track.album, albumArtUrl: n.art, durationMs: n.durationMs };
    s.progressMs = 0; s.positionAt = now; s.next = prev.next.slice(1); s.isPlaying = true;
  } else if (action === "previous") {
    s.progressMs = 0; s.positionAt = now;
  } else if (action === "volume" && typeof value === "number") {
    s.volumePercent = Math.max(0, Math.min(100, Math.round(value)));
  }
  await saveState(s);

  let path = "me/player/play", method = "PUT";
  if (action === "pause") path = "me/player/pause";
  else if (action === "next") { path = "me/player/next"; method = "POST"; }
  else if (action === "previous") { path = "me/player/previous"; method = "POST"; }
  else if (action === "volume") path = `me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(value ?? 0)))}`;
  const res = await spotifyFetch(path, { method });
  const ok = res.ok || res.status === 204;
  // confirm with Spotify and the speakers a moment later, after the response goes out
  after(async () => { await new Promise((r) => setTimeout(r, 700)); await tick({ force: true }).catch(() => {}); });
  return { state: s, ok, status: res.status };
}
