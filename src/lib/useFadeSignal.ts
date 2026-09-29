"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns whether content should render at full opacity — flips to false for
 * one frame whenever `signal` changes (new data arrived), then back to true,
 * so a widget can transition-opacity a wrapper div for a slow, obvious
 * "this just updated" cue instead of silently snapping to new content.
 */
export function useFadeSignal(signal: unknown): boolean {
  const [visible, setVisible] = useState(true);
  const first = useRef(true);
  const prev = useRef(signal);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      prev.current = signal;
      return;
    }
    if (prev.current === signal) return;
    prev.current = signal;

    setVisible(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    return () => cancelAnimationFrame(id);
  }, [signal]);

  return visible;
}
