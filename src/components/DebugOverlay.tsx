"use client";

import { useEffect, useState } from "react";
import { installFlashLog, readHbLog } from "@/lib/flashLog";

/** ?debug=1: the last events (page loads, reloads, errors, backdrop swaps) in a corner. */
export function DebugOverlay() {
  const [rows, setRows] = useState<{ t: number; m: string }[]>([]);
  useEffect(() => {
    installFlashLog();
    const tick = () => setRows(readHbLog().slice(-14));
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="fixed left-2 bottom-2 z-50 pointer-events-none font-mono text-[11px] leading-tight text-lime-300/90 bg-black/70 p-2 rounded max-w-[60vw]">
      {rows.map((r, i) => (
        <div key={i}>{new Date(r.t).toLocaleTimeString([], { hour12: false })} {r.m}</div>
      ))}
    </div>
  );
}
