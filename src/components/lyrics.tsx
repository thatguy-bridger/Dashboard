"use client";
import { useRef } from "react";
import type { LyricView } from "@/lib/lyrics";
import { useLayers } from "@/lib/useLayers";
import { Icon } from "./Icon";

/** The lyrics for the Music scene: ONE large current line that replaces itself with a soft cross-fade as the song moves on (like the old dashboard). */
export function LyricsBlock({ view }: { view: LyricView }) {
  const texts = useRef(new Map<string, { text: string; instrumental: boolean }>());
  const key = String(view.index);
  texts.current.set(key, { text: view.current, instrumental: view.instrumental || view.index < 0 });
  if (texts.current.size > 8) { const first = texts.current.keys().next().value; if (first !== undefined && first !== key) texts.current.delete(first); }
  const layers = useLayers(key, 900);
  return (
    <div className="lyrics" aria-live="off">
      {layers.map((l) => {
        const t = texts.current.get(l.key) ?? { text: "", instrumental: true };
        return <div key={l.id} className={`lyricline ${l.leaving ? "leaving" : ""} ${t.instrumental ? "instr" : ""}`}>{t.instrumental ? <Icon name="note" /> : t.text}</div>;
      })}
    </div>
  );
}

/** A one-line ticker for scenes that aren't about the music. */
export function LyricTicker({ view }: { view: LyricView | null }) {
  if (!view || view.index < 0) return null;
  return <div className="ticker" key={view.index}>{view.instrumental ? <Icon name="note" /> : <span className="fit">{view.current}</span>}</div>;
}
