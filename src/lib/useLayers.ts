"use client";
import { useEffect, useRef, useState } from "react";

/** Cross-fade bookkeeping: when `key` changes the old layer fades out while the new one fades in. Never flickers: it only adds/removes layers. */
export function useLayers<K extends string>(key: K, ms = 1100) {
  const [layers, setLayers] = useState<{ id: number; key: K; leaving: boolean }[]>([{ id: 0, key, leaving: false }]);
  const next = useRef(1);
  useEffect(() => {
    setLayers((ls) => {
      const cur = ls.filter((l) => !l.leaving).at(-1);
      if (cur?.key === key) return ls;
      return [...ls.map((l) => ({ ...l, leaving: true })), { id: next.current++, key, leaving: false }];
    });
    const t = setTimeout(() => setLayers((ls) => ls.filter((l) => !l.leaving)), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return layers;
}
