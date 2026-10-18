import { d1Query } from "@/lib/d1";

const KEY = "tabletScreen";
/** Which Home Assistant app is the wall tablet (its notify service), and how bright its screen is when awake (0-255). */
export interface TabletCfg { service: string | null; awake: number }
export const DEFAULT_AWAKE = 110;

export async function loadTabletCfg(): Promise<TabletCfg> {
  try {
    const rows = await d1Query<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", [KEY]);
    const v = rows[0]?.value ? JSON.parse(rows[0].value) : {};
    return { service: typeof v.service === "string" ? v.service : null, awake: typeof v.awake === "number" ? v.awake : DEFAULT_AWAKE };
  } catch {
    return { service: null, awake: DEFAULT_AWAKE };
  }
}

export const saveTabletCfg = (c: TabletCfg) =>
  d1Query(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [KEY, JSON.stringify(c)]);
