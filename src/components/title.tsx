"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { titleGradient } from "@/lib/theme";
import { useLayers } from "@/lib/useLayers";

/** The song title painted with a soft gradient of the colours affecting the song. A new song cross-fades slowly (the old title fades out as the new one fades in). */
export function GradientTitle({ text, id, palette, fallback, className = "", maxLines = 0 }: { text: string; id: string; palette?: string[]; fallback: string; className?: string; maxLines?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const gradient = useMemo(() => titleGradient(palette, fallback), [palette, fallback]);
  const seen = useRef(new Map<string, { text: string; gradient: string }>());
  seen.current.set(id, { text, gradient });
  if (seen.current.size > 6) { const k = seen.current.keys().next().value; if (k !== undefined && k !== id) seen.current.delete(k); }
  const layers = useLayers(id, 1200);
  useLayoutEffect(() => {
    const el = box.current; if (!el || !maxLines) return;
    const fit = () => {
      el.style.fontSize = "";
      const layer = el.querySelector(".gt-layer") as HTMLElement | null; if (!layer) return;
      let size = parseFloat(getComputedStyle(el).fontSize) || 16; const min = size * 0.4;
      for (let i = 0; i < 24; i++) {
        const lh = parseFloat(getComputedStyle(layer).lineHeight) || size * 1.1;
        if (layer.scrollHeight <= lh * maxLines + 2 || size <= min) break;
        size *= 0.93; el.style.fontSize = `${size}px`;
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit); ro.observe(el.parentElement ?? el); return () => ro.disconnect();
  }, [text, maxLines]);
  return (
    <div ref={box} className={`gtitle ${className}`}>
      {layers.map((l) => { const t = seen.current.get(l.key) ?? { text, gradient }; return <div key={l.id} className={`gt-layer ${l.leaving ? "leaving" : ""}`} style={{ backgroundImage: t.gradient }}>{t.text}</div>; })}
    </div>
  );
}
