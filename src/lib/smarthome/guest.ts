import { d1Query } from "@/lib/d1";
import { haConfigured } from "./index";
import { peopleHome } from "./homeAssistant";
import type { HomeAction } from "./types";

export type GuestMode = "auto" | "on" | "off";
export interface GuestState {
  /** guest mode is in force right now */
  active: boolean;
  mode: GuestMode;
  /** the owner's phone is not home */
  ownerAway: boolean;
  /** owner unlocked it with the PIN until this time (ms); 0 = no unlock */
  overrideUntil: number;
}

const KEY = "guestMode";
let cache: { at: number; value: GuestState } | null = null;
const TTL = 10_000;

async function stored(): Promise<{ mode: GuestMode; overrideUntil: number }> {
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [KEY]);
    const v = rows[0]?.value ? JSON.parse(rows[0].value) : {};
    return { mode: v.mode === "on" || v.mode === "off" ? v.mode : "auto", overrideUntil: typeof v.overrideUntil === "number" ? v.overrideUntil : 0 };
  } catch {
    return { mode: "auto", overrideUntil: 0 };
  }
}

/** Auto: guest mode while the owner (the person named Bridger, else everyone) is away, unless unlocked with the PIN. */
export async function getGuestState(fresh = false): Promise<GuestState> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.value;
  const s = await stored();
  let ownerAway = false;
  if (haConfigured()) {
    try {
      const people = await peopleHome();
      const owners = people.filter((p) => /bridger/i.test(p.name));
      const group = owners.length ? owners : people;
      ownerAway = group.length > 0 && group.every((p) => !p.home);
    } catch {
      ownerAway = false; // can't tell: don't lock anyone out
    }
  }
  const unlocked = s.overrideUntil > Date.now();
  const active = s.mode === "on" || (s.mode === "auto" && ownerAway && !unlocked);
  const value = { active, mode: s.mode, ownerAway, overrideUntil: s.overrideUntil };
  cache = { at: Date.now(), value };
  return value;
}

export async function saveGuest(patch: Partial<{ mode: GuestMode; overrideUntil: number }>) {
  const cur = await stored();
  const next = { ...cur, ...patch };
  await d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [KEY, JSON.stringify(next)]);
  cache = null;
}

export const bustGuest = () => { cache = null; };

/** What a guest may not do: colours/brightness/scenes, and anything that starts or changes music. */
export function guestBlocksAction(action: HomeAction, ids: string[]): boolean {
  if (["brightness", "colorTemp", "color", "activate", "play", "next", "previous", "volume"].includes(action.type)) return true;
  if ((action.type === "on" || action.type === "toggle") && ids.some((id) => id.startsWith("media_player."))) return true;
  return false;
}
