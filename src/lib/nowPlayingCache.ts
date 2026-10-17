/** Shared by the now-playing and control routes: the control route clears `cache` so the poll
 *  right after a pause/skip reads Spotify instead of the stale copy. */
export const npState: { cache: { at: number; body: unknown } | null; blockedUntil: number } = { cache: null, blockedUntil: 0 };
