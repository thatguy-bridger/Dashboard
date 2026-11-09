"use client";
// Starting music from the Music page. The page itself stays calm: it shows only the output (the speaker you use) and one 'Play something' button; the playlists
// live on a screen that opens over it. Permuta does the starting (it wakes the speaker, finds it in Spotify and plays); the page asks, shows that it's working,
// and says so if it didn't happen. With nothing playing, the same playlists are shown straight away (the page is empty anyway).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { musicError, parsePlaylists, parseSpeakers, playCommand } from "@/lib/playlists";
import { pickOutput } from "@/lib/speakers";
import type { ScreenData } from "@/lib/types";

function useOutput(data: ScreenData | null, playingOn?: string | null) {
  const extra = data?.extra ?? {};
  const speakers = useMemo(() => { const l = parseSpeakers(extra["speakers"]); return l.length ? l : (data?.screen?.visibleSpeakers ?? []); }, [extra["speakers"], data?.screen?.visibleSpeakers]); // eslint-disable-line react-hooks/exhaustive-deps
  const preferred = data?.screen?.defaultSpeaker || "Bridger's Speakers";
  const [chosen, setChosen] = useState<string | null>(null);
  const output = chosen ?? pickOutput(playingOn, preferred, speakers);
  return { speakers: speakers.length ? speakers : [preferred], preferred, output, setChosen };
}

/** The speaker you're using, as small chips. Usually just one; tap another if you've chosen to show more. */
function Output({ speakers, output, preferred, onPick }: { speakers: string[]; output: string; preferred: string; onPick: (s: string) => void }) {
  return (
    <div className="pp-speakers">
      {speakers.slice(0, 4).map((s) => (
        <button key={s} className={`pp-chip ${s === output ? "on" : ""}`} onClick={() => onPick(s)}><Icon name="speaker" /><span>{s === preferred && s !== output ? `${s} · suggested` : s}</span></button>
      ))}
    </div>
  );
}

type Start = { start: (uri: string | null, id: string) => void; busy: string | null; failed: string | null };
function useStart(data: ScreenData | null, playingOn: string | null | undefined, output: string, control: (c: Record<string, unknown>) => void, onStarted?: () => void): Start {
  const extra = data?.extra ?? {};
  const [busy, setBusy] = useState<string | null>(null);
  const [since, setSince] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => { if (!busy) return; const t = setTimeout(() => { setBusy(null); setFailed("Couldn't start. Is Permuta open?"); }, 14000); return () => clearTimeout(t); }, [busy]);
  useEffect(() => { if (busy) { const err = musicError(extra["music_error"], since); if (err) { setBusy(null); setFailed(err); } } }, [extra["music_error"], busy, since]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (busy && playingOn) setBusy(null); }, [playingOn, busy]);
  const start = (uri: string | null, id: string) => { setFailed(null); setBusy(id); setSince(Math.floor(Date.now() / 1000)); control(playCommand(uri, output)); onStarted?.(); };
  return { start, busy, failed };
}

/** The playlists and 'Continue', as a grid. */
function Tiles({ playlists, s, big }: { playlists: ReturnType<typeof parsePlaylists>; s: Start; big?: boolean }) {
  return (
    <div className={`pp-grid ${big ? "big" : ""}`}>
      <button className="pp-tile resume" onClick={() => s.start(null, "resume")} disabled={!!s.busy}><span className="pp-art"><Icon name="play" /></span><span className="pp-name">Continue</span></button>
      {playlists.map((p) => (
        <button key={p.id} className="pp-tile" onClick={() => s.start(p.uri, p.id)} disabled={!!s.busy}>
          <span className="pp-art">{p.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.image} alt="" /> : <Icon name="note" />}</span>
          <span className="pp-name">{p.name}</span>
        </button>
      ))}
    </div>
  );
}

/** What the Music scene shows while something plays: the output and one button. The playlists open over the page. */
export function PlayEntry({ data, playingOn, control }: { data: ScreenData | null; playingOn?: string | null; control: (c: Record<string, unknown>) => void }) {
  const o = useOutput(data, playingOn);
  const [open, setOpen] = useState(false);
  const s = useStart(data, playingOn, o.output, control, () => setOpen(false));
  const playlists = useMemo(() => parsePlaylists(data?.extra?.["playlists"]), [data?.extra]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [open]);
  return (
    <>
      <div className="playentry" onClick={(e) => e.stopPropagation()}>
        <button className="pe-btn icononly" onClick={() => setOpen(true)} disabled={!!s.busy} aria-label="Play something" title={s.busy ? "Starting…" : "Play something"}><Icon name={s.busy ? "clock" : "note"} /></button>
        {s.failed && <span className="pp-fail">{s.failed}</span>}
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <div className="pp-overlay" role="dialog" aria-label="Play something" onClick={() => setOpen(false)}>
          <div className="pp-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pp-sheethead"><div className="cap">Play something on</div><Output speakers={o.speakers} output={o.output} preferred={o.preferred} onPick={o.setChosen} /><button className="pp-close" onClick={() => setOpen(false)} aria-label="Close"><Icon name="backspace" /></button></div>
            <Tiles playlists={playlists} s={s} big />
          </div>
        </div>, document.body)}
    </>
  );
}

/** Nothing playing: the same choice, straight on the page. */
export function PlayPanel({ data, playingOn, control }: { data: ScreenData | null; playingOn?: string | null; control: (c: Record<string, unknown>) => void; big?: boolean }) {
  const o = useOutput(data, playingOn);
  const s = useStart(data, playingOn, o.output, control);
  const playlists = useMemo(() => parsePlaylists(data?.extra?.["playlists"]), [data?.extra]);
  return (
    <div className="playpanel big" onClick={(e) => e.stopPropagation()}>
      <div className="pp-head"><div className="cap">Play something on</div><Output speakers={o.speakers} output={o.output} preferred={o.preferred} onPick={o.setChosen} /></div>
      <Tiles playlists={playlists} s={s} big />
      {s.busy && <div className="pp-note">Starting on {o.output}…</div>}
      {s.failed && <div className="pp-fail">{s.failed}</div>}
    </div>
  );
}
