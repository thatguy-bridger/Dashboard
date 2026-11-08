"use client";
import { useMemo, useRef } from "react";
import { titleGradient } from "@/lib/theme";
import { useLayers } from "@/lib/useLayers";

/** The song title painted with a soft gradient of the colours affecting the song. A new song cross-fades slowly (the old title fades out as the new one fades in). */
export function GradientTitle({ text, id, palette, fallback, className = "" }: { text: string; id: string; palette?: string[]; fallback: string; className?: string }) {
  const gradient = useMemo(() => titleGradient(palette, fallback), [palette, fallback]);
  const seen = useRef(new Map<string, { text: string; gradient: string }>());
  seen.current.set(id, { text, gradient });
  if (seen.current.size > 6) { const k = seen.current.keys().next().value; if (k !== undefined && k !== id) seen.current.delete(k); }
  const layers = useLayers(id, 1200);
  return (
    <div className={`gtitle ${className}`}>
      {layers.map((l) => { const t = seen.current.get(l.key) ?? { text, gradient }; return <div key={l.id} className={`gt-layer ${l.leaving ? "leaving" : ""}`} style={{ backgroundImage: t.gradient }}>{t.text}</div>; })}
    </div>
  );
}
