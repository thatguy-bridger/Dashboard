import { after } from "next/server";
import { getProvider, haConfigured } from "@/lib/smarthome";
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
const REUSE_MS = 30_000;

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

const isSpotify = (app: string) => /spotify/i.test(app);
/** Speakers playing something right now (any app) that say what it is. */
const playingSpeakers = (sp: SpeakerInfo[]) => sp.filter((x) => x.state === "playing" && x.title);

/** The speaker to believe about what is playing: the one Spotify says it plays on, else one with cover art, else the first. */
function pickHeard(playing: SpeakerInfo[], spotifyDevice: string | null): SpeakerInfo | undefined {
  const byDevice = spotifyDevice ? playing.find((x) => norm(x.name) === norm(spotifyDevice)) : undefined;
  return byDevice ?? playing.find((x) => x.hasPicture) ?? playing[0];
}

/** A song as a speaker describes it: no Spotify id, and often no length (live radio, streams). */
function speakerTrack(h: SpeakerInfo, prev: MusicState): MusicTrack {
  const id = `ha:${h.id}:${norm(h.title)}`;
  return {
    id, name: h.title, artists: h.artist, album: h.album || h.app,
    albumArtUrl: h.hasPicture ? `/api/music/art?e=${encodeURIComponent(h.id)}&v=${encodeURIComponent(norm(h.title).slice(0, 40))}` : null,
    durationMs: h.durationMs || (prev.track?.id === id ? prev.track.durationMs : 0),
  };
}

/** Asks Spotify and fuses the answer with the speakers: the speakers are a source of their own, so music that doesn't come
 *  from Spotify (another app cast to a speaker, a radio stream, the TV) shows up too. `force` skips the idle shortcut. */
export async function tick(opts: { force?: boolean } = {}): Promise<MusicState> {
  const now = Date.now();
  const prev = await loadState();
  if (!opts.force && now - prev.updatedAt < 900) return prev; // several speakers change at once: one update is enough
  const [speakers, blocked, cfg] = await Promise.all([
    haConfigured() ? speakerStates().catch(() => [] as SpeakerInfo[]) : Promise.resolve([] as SpeakerInfo[]),
    spotifyBlockedUntil(),
    loadLightsCfg(),
  ]);
  const playing = playingSpeakers(speakers);
  const s: MusicState = { ...prev, blockedUntil: blocked > now ? blocked : undefined, error: undefined };

  // Only ask Spotify when it could know something: it is playing, a speaker plays Spotify, or nothing plays anywhere (and it has been a while).
  // Music from another app doesn't need Spotify's answer.
  const spotifyMayKnow = prev.isPlaying && prev.source !== "speaker" || playing.some((x) => isSpotify(x.app) || !x.app) || (!playing.length && now - prev.spotifyAt > IDLE_ASK_MS);
  let asked = false;
  let spotifyPlaying = false;
  // While a speaker confirms the same Spotify song is still playing, Spotify's answer from the last few seconds is still true:
  // the speaker supplies the position, and Spotify is only asked again on a song change or every 30 seconds. (Spotify
  // locks the app out for hours when asked too often, and it is the speaker that notices a song change first anyway.)
  const heardNow = pickHeard(playing, prev.device?.name ?? null);
  const reused = !opts.force && prev.source === "spotify" && prev.isPlaying && Boolean(prev.track) && Boolean(heardNow)
    && isSpotify(heardNow!.app) && norm(heardNow!.title) === norm(prev.track!.name) && now - prev.spotifyAt < REUSE_MS;
  if (reused) {
    spotifyPlaying = true;
    if (heardNow!.positionMs != null && heardNow!.at != null) { s.progressMs = heardNow!.positionMs + (now - heardNow!.at); s.positionAt = now; }
  }
  if (!reused && (opts.force || spotifyMayKnow) && blocked <= now) {
    const sent = Date.now();
    const res = await spotifyFetch("me/player?additional_types=track");
    asked = true;
    if (res.status === 401) { s.connected = false; s.isPlaying = false; s.track = null; s.source = "idle"; }
    else if (res.status === 429) { s.error = "rate limited by Spotify"; s.blockedUntil = await spotifyBlockedUntil(); }
    else if (res.status === 204 || res.status === 404) { s.connected = true; s.spotifyAt = Date.now(); s.isPlaying = false; s.source = "idle"; }
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
        spotifyPlaying = s.isPlaying;
      } else { s.isPlaying = false; s.source = "idle"; }
    }
  }

  // ---- cross-checks against the speakers ----
  const heard = pickHeard(playing, s.device?.name ?? null);
  let fromSpeaker = false;
  s.doubt = false;
  s.mismatch = false;
  if (spotifyPlaying && s.track) {
    const mine = s.device ? speakers.filter((x) => norm(x.name) === norm(s.device!.name)) : [];
    // 1. Spotify says playing, the speaker it plays on says it stopped: the speaker knows first (Spotify lags a few seconds after a pause).
    //    (It has to be true on two updates in a row, so a speaker that is just slow to start after Play doesn't make the screens flicker.)
    if (mine.length && mine.every((x) => ["paused", "idle", "off", "standby"].includes(x.state))) {
      if (prev.doubt) { s.isPlaying = false; s.source = "speaker"; } else s.doubt = true;
    }
    // 2. The speaker already moved on to the song that was queued next, but Spotify still shows the old one: take the queued song.
    // 3. The speaker plays something Spotify knows nothing about (another app took over): after two updates in a row, believe the speaker.
    if (heard && s.isPlaying && norm(heard.title) !== norm(s.track.name)) {
      const q = s.track.id === prev.track?.id ? prev.next.find((n) => norm(n.name) === norm(heard.title)) : undefined;
      if (q) {
        s.track = { id: q.id, name: q.name, artists: q.artists, album: s.track.album, albumArtUrl: q.art, durationMs: q.durationMs };
        s.progressMs = heard.positionMs != null && heard.at != null ? heard.positionMs + (now - heard.at) : 0;
        s.positionAt = now;
        s.source = "speaker";
      } else if (prev.mismatch) fromSpeaker = true;
      else s.mismatch = true;
    }
  } else if (heard) {
    // Spotify has nothing playing (or couldn't be asked, or isn't what is playing): the speaker is the source.
    fromSpeaker = true;
  }
  if (fromSpeaker && heard) {
    const t = speakerTrack(heard, prev);
    s.track = t;
    s.isPlaying = true;
    s.progressMs = heard.positionMs != null && heard.at != null ? heard.positionMs + (now - heard.at) : prev.track?.id === t.id ? positionNow(prev, now) : 0;
    s.positionAt = now;
    s.device = null;
    s.volumePercent = heard.volume ?? s.volumePercent;
    s.source = "speaker";
    s.next = [];
    s.palette = prev.palette && prev.palette.trackId === t.id ? prev.palette : null;
  } else if (prev.source === "speaker" && s.source === "speaker" && !heard && !spotifyPlaying) {
    // what the speaker was playing has stopped
    s.isPlaying = false; s.track = null; s.next = []; s.progressMs = 0; s.source = "idle";
  } else if (asked && s.source === "idle" && !(prev.isPlaying && now - prev.spotifyAt < 20_000)) {
    // between songs Spotify can briefly say "nothing"; only a lasting nothing clears the song
    s.track = null; s.next = []; s.progressMs = 0;
  } else if (asked && s.source === "idle") {
    s.track = prev.track; s.progressMs = prev.progressMs; s.isPlaying = prev.isPlaying;
  }
  // Spotify couldn't be asked (locked out / failed) and no speaker explains it: keep going from an estimate.
  if (!reused && !fromSpeaker && (!asked || s.error) && prev.isPlaying && prev.track && s.track && !heard && speakers.length) {
    s.isPlaying = false; s.source = "speaker"; // the speakers say nothing plays any more
  } else if (!reused && !fromSpeaker && (!asked || s.error) && prev.isPlaying && prev.track && s.track) {
    const pos = positionNow(prev, now);
    if (prev.track.durationMs > 0 && pos >= prev.track.durationMs - 300 && prev.next[0]) {
      const n = prev.next[0];
      s.track = { id: n.id, name: n.name, artists: n.artists, album: prev.track.album, albumArtUrl: n.art, durationMs: n.durationMs };
      s.progressMs = 0; s.positionAt = now; s.next = prev.next.slice(1);
    }
    s.source = "estimate";
  }

  // who is playing it, and on what
  if (s.track && s.isPlaying) {
    if (s.source === "speaker" && heard) s.origin = { app: heard.app || "Speaker", speaker: heard.name, entity: heard.id };
    else {
      const dev = s.device?.name;
      const ent = dev ? speakers.find((x) => norm(x.name) === norm(dev)) : undefined;
      s.origin = { app: "Spotify", speaker: dev ?? "", entity: ent?.id ?? null };
    }
  } else s.origin = null;

  // ---- queue and covers, ahead of time ----
  const songChanged = s.track?.id !== prev.track?.id;
  const spotifyTrack = Boolean(s.track && !s.track.id.startsWith("ha:"));
  if (spotifyTrack && s.isPlaying && blocked <= now && (songChanged || (asked && now - s.queueAt > QUEUE_EVERY_MS) || (!s.next.length && now - s.queueAt > 20_000))) {
    const q = await readQueue();
    if (q) { s.next = q; s.queueAt = now; }
  } else if (songChanged && spotifyTrack) {
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

  // Music that comes straight from a speaker (not Spotify) is controlled on that speaker.
  const entity = prev.source === "speaker" && prev.origin?.entity ? prev.origin.entity : null;
  if (entity) {
    let ok = true;
    try {
      const p = getProvider();
      if (action === "volume") await p.act(entity, { type: "volume", value: Math.max(0, Math.min(100, Math.round(value ?? 0))) });
      else await p.act(entity, { type: action });
    } catch { ok = false; }
    after(async () => { await new Promise((r) => setTimeout(r, 700)); await tick({ force: true }).catch(() => {}); });
    return { state: s, ok };
  }

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
