// Which speakers the page shows. Permuta sends the ones you actually use (config:screen.visibleSpeakers; state:speakers is the same list);
// with no list at all everything shows (old behaviour). Names are compared without case, spaces or punctuation.
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function visibleSpeaker(name: string, visible?: string[] | null): boolean {
  if (!visible || visible.length === 0) return true;
  const n = norm(name);
  return visible.some((v) => norm(v) === n);
}

/** The output to start music on: the one already playing, else the preferred one, else the first you use. */
export function pickOutput(playingOn: string | null | undefined, preferred: string | undefined, available: string[]): string {
  if (playingOn && playingOn.trim()) return playingOn;
  if (preferred && (available.length === 0 || available.some((a) => norm(a) === norm(preferred)))) return preferred;
  return available[0] ?? preferred ?? "Bridger's Speakers";
}
