"use client";
// "Play something": the user's playlists and a speaker, so the Music page can start music itself. Permuta does the starting (it wakes the
// speaker, finds it in Spotify and plays); the page only asks, shows that it's working, and says so if it didn't happen.
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { musicError, parsePlaylists, parseSpeakers, playCommand } from "@/lib/playlists";
import type { ScreenData } from "@/lib/types";

export function PlayPanel({ data, playingOn, control, big = false }: { data: ScreenData | null; playingOn?: string | null; control: (c: Record<string, unknown>) => void; big?: boolean }) {
  const extra = data?.extra ?? {};
  const playlists = useMemo(() => parsePlaylists(extra["playlists"]), [extra["playlists"]]);           // eslint-disable-line react-hooks/exhaustive-deps
  const speakers = useMemo(() => parseSpeakers(extra["speakers"]), [extra["speakers"]]);               // eslint-disable-line react-hooks/exhaustive-deps
  const preferred = data?.screen?.defaultSpeaker || "Bridger's Speakers";
  const [speaker, setSpeaker] = useState<string>(playingOn || preferred);
  const [busy, setBusy] = useState<string | null>(null);
  const [since, setSince] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { if (!playingOn && !speakers.length) setSpeaker(preferred); }, [playingOn, preferred, speakers.length]);
  useEffect(() => { if (!busy) return; const t = setTimeout(() => { setBusy(null); setFailed("Couldn't start. Is Permuta open?"); }, 14000); return () => clearTimeout(t); }, [busy]);
  useEffect(() => { if (busy) { const err = musicError(extra["music_error"], since); if (err) { setBusy(null); setFailed(err); } } }, [extra["music_error"], busy, since]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (busy && playingOn) setBusy(null); }, [playingOn, busy]);

  const start = (uri: string | null, id: string) => { setFailed(null); setBusy(id); setSince(Math.floor(Date.now() / 1000)); control(playCommand(uri, speaker)); };
  const options = speakers.length ? speakers : [preferred];

  return (
    <div className={`playpanel ${big ? "big" : ""}`}>
      <div className="pp-head">
        <div className="cap">Play something</div>
        <div className="pp-speakers">
          {options.slice(0, 4).map((s) => (
            <button key={s} className={`pp-chip ${s === speaker ? "on" : ""}`} onClick={() => setSpeaker(s)}><Icon name="speaker" /><span className="fit">{s === preferred && s !== speaker ? `${s} · suggested` : s}</span></button>
          ))}
        </div>
      </div>
      <div className="pp-row">
        <button className="pp-tile resume" onClick={() => start(null, "resume")} disabled={!!busy}><span className="pp-art"><Icon name={busy === "resume" ? "clock" : "play"} /></span><span className="pp-name fit">{busy === "resume" ? "Starting…" : "Continue"}</span></button>
        {playlists.map((p) => (
          <button key={p.id} className="pp-tile" onClick={() => start(p.uri, p.id)} disabled={!!busy}>
            <span className="pp-art">{p.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.image} alt="" /> : <Icon name="note" />}{busy === p.id && <span className="pp-busy"><Icon name="clock" /></span>}</span>
            <span className="pp-name fit">{busy === p.id ? "Starting…" : p.name}</span>
          </button>
        ))}
      </div>
      {failed && <div className="pp-fail">{failed}</div>}
    </div>
  );
}
