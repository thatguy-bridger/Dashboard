"use client";

/** Tiny event log for chasing visual glitches on a kiosk where devtools aren't available.
 *  Open the screen with ?debug=1 to see the last events on top of the display. */
const KEY = "hb-flashlog";
type Entry = { t: number; m: string };

export function hbLog(m: string) {
  try {
    const arr: Entry[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    arr.push({ t: Date.now(), m });
    localStorage.setItem(KEY, JSON.stringify(arr.slice(-60)));
  } catch {
    // storage unavailable: logging is best-effort
  }
}

export function readHbLog(): Entry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

let installed = false;
/** Records page loads (and whether it was a reload), errors, visibility and resize changes. */
export function installFlashLog() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  hbLog(`PAGE LOAD (${nav?.type ?? "?"}) ${window.innerWidth}x${window.innerHeight}`);
  hbLog(`UA ${navigator.userAgent.slice(-70)} mem=${(navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "?"}`);
  window.addEventListener("error", (e) => hbLog(`ERROR ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => hbLog(`REJECTION ${String((e as PromiseRejectionEvent).reason).slice(0, 80)}`));
  document.addEventListener("visibilitychange", () => hbLog(`visibility ${document.visibilityState}`));
  window.addEventListener("resize", () => hbLog(`resize ${window.innerWidth}x${window.innerHeight}`));
  window.addEventListener("online", () => hbLog("network online"));
  window.addEventListener("offline", () => hbLog("network offline"));
}
