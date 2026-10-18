import { d1Query } from "@/lib/d1";
import { haConfigured } from "@/lib/smarthome";
import { motionState, tabletDeviceStates } from "@/lib/smarthome/homeAssistant";
import { loadState } from "@/lib/music/state";

/** The tablet's battery, written down every few minutes together with what was going on, so the biggest drains can be found
 *  from real data instead of guesses. */

let ready = false;
async function ensureTable() {
  if (ready) return;
  await d1Query(`CREATE TABLE IF NOT EXISTS battery_log (
    ts INTEGER PRIMARY KEY, level REAL, charging INTEGER, screen INTEGER, temp REAL, motion INTEGER, music INTEGER, extra TEXT
  )`);
  ready = true;
}

const num = (v: string | undefined) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? n : null; };
/** the extra readings worth keeping (everything else the app reports is noise for this purpose) */
const KEEP = /^(battery_state|charger_type|battery_health|battery_power|wifi_signal_strength|wifi_connection|light_sensor|screen_brightness|app_importance|do_not_disturb_sensor|audio_mode|power_save|screen_timeout|volume_level_media)/;

export async function logBattery(device: string): Promise<{ level: number | null }> {
  await ensureTable();
  const [dev, motion, music] = await Promise.all([
    haConfigured() ? tabletDeviceStates(device).catch(() => ({} as Record<string, string>)) : Promise.resolve({} as Record<string, string>),
    motionState().catch(() => null),
    loadState().catch(() => null),
  ]);
  const level = num(dev.battery_level);
  if (level == null) return { level: null };
  const state = dev.battery_state ?? "";
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(dev)) if (KEEP.test(k)) extra[k] = v;
  await d1Query(
    "INSERT OR REPLACE INTO battery_log (ts, level, charging, screen, temp, motion, music, extra) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [Date.now(), level, state === "charging" || state === "full" || dev.is_charging === "on" ? 1 : 0, dev.interactive === "on" ? 1 : dev.interactive === "off" ? 0 : null, num(dev.battery_temperature), motion?.active ? 1 : 0, music?.isPlaying ? 1 : 0, JSON.stringify(extra)]
  );
  await d1Query("DELETE FROM battery_log WHERE ts < ?", [Date.now() - 30 * 86_400_000]).catch(() => {});
  return { level };
}

interface Row { ts: number; level: number; charging: number; screen: number | null; temp: number | null; motion: number; music: number; extra: string | null }

interface Bucket { label: string; hours: number; change: number; perHour: number | null }

/** Percent per hour between consecutive samples, grouped by what was going on at the start of each interval. Gaps over
 *  15 minutes are skipped (the tablet or the log was offline). `charging` picks drain (unplugged) or net change (plugged in). */
function rates(rows: Row[], charging: 0 | 1, key: (r: Row) => string | null): Bucket[] {
  const acc = new Map<string, { hours: number; change: number }>();
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const dt = (b.ts - a.ts) / 3_600_000;
    if (dt <= 0 || dt > 0.25 || a.charging !== charging || b.charging !== charging) continue;
    const k = key(a);
    if (k == null) continue;
    const cur = acc.get(k) ?? { hours: 0, change: 0 };
    cur.hours += dt; cur.change += b.level - a.level;
    acc.set(k, cur);
  }
  return [...acc.entries()].map(([label, v]) => ({ label, hours: Math.round(v.hours * 100) / 100, change: Math.round(v.change * 10) / 10, perHour: v.hours >= 0.2 ? Math.round((v.change / v.hours) * 10) / 10 : null })).sort((x, y) => x.label.localeCompare(y.label));
}

export async function batteryReport(days = 7) {
  await ensureTable();
  const rows = await d1Query<Row>("SELECT * FROM battery_log WHERE ts > ? ORDER BY ts", [Date.now() - days * 86_400_000]);
  const screen = (r: Row) => (r.screen == null ? null : r.screen ? "Screen on" : "Screen off");
  const music = (r: Row) => (r.music ? "Music playing" : "No music");
  const motion = (r: Row) => (r.motion ? "Someone in front" : "Nobody in front");
  const hour = (r: Row) => String(new Date(r.ts).getHours()).padStart(2, "0") + ":00";
  const last = rows[rows.length - 1];
  return {
    samples: rows.length,
    since: rows[0]?.ts ?? null,
    now: last ? { level: last.level, charging: Boolean(last.charging), temp: last.temp, screen: last.screen, extra: last.extra ? JSON.parse(last.extra) : {} } : null,
    /** unplugged: how fast the battery falls, per situation (the numbers to look at) */
    drain: { overall: rates(rows, 0, () => "All"), screen: rates(rows, 0, screen), music: rates(rows, 0, music), motion: rates(rows, 0, motion), hour: rates(rows, 0, hour) },
    /** plugged in: how much the battery still gains per hour; a busy tablet gains slower */
    charging: { overall: rates(rows, 1, () => "All"), screen: rates(rows, 1, screen), music: rates(rows, 1, music), motion: rates(rows, 1, motion) },
    /** the last 48 hours, one point per sample, for the chart */
    series: rows.filter((r) => r.ts > Date.now() - 48 * 3_600_000).map((r) => [r.ts, r.level, r.charging, r.screen ?? -1]),
  };
}
