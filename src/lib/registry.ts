import { d1Query } from "@/lib/d1";
import type { PresetWidget } from "@/lib/presets";
import { parseWidgets } from "@/lib/presets";
import { parseBackground, type BackgroundConfig } from "@/lib/background";
import { mergeScenes, mergeStandByLayout, type StandByItem, type StandByScene } from "@/lib/standby";

export type DeviceStatus = "pending" | "approved" | "rejected";

/** A device's own layout, independent of whatever preset it's assigned — set once someone
 *  edits a live screen directly rather than through its preset. */
export interface DeviceLayout {
  widgets: PresetWidget[];
  background: BackgroundConfig;
}

/** A screen's own StandBy (layout + scenes), used instead of the global one. */
export interface DeviceStandBy {
  layout: StandByItem[];
  scenes: StandByScene[];
}

export interface Device {
  id: string;
  name: string | null;
  status: DeviceStatus;
  ip: string | null;
  userAgent: string | null;
  touchCapable: boolean;
  touchOverride: boolean | null;
  presetId: string | null;
  layout: DeviceLayout | null;
  /** Per-screen view: "standby" | "grid" | "touch" (control panel), or null to follow the global setting. */
  viewMode: "standby" | "grid" | "touch" | null;
  /** StandBy scene pinned to this screen ("base" = Default layout), or null = automatic by schedule. */
  sceneId: string | null;
  /** Per-screen StandBy profile; null = use the global one. */
  standby: DeviceStandBy | null;
  firstSeen: number;
  lastSeen: number;
}

interface DeviceRow {
  id: string;
  name: string | null;
  status: DeviceStatus;
  ip: string | null;
  user_agent: string | null;
  touch_capable: number;
  touch_override: number | null;
  preset_id: string | null;
  layout: string | null;
  view_mode: string | null;
  scene_id: string | null;
  standby: string | null;
  first_seen: number;
  last_seen: number;
}

function parseLayout(raw: string | null): DeviceLayout | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return { widgets: parseWidgets(obj.widgets), background: parseBackground(obj.background) };
  } catch {
    return null;
  }
}

function parseStandBy(raw: string | null): DeviceStandBy | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    return { layout: mergeStandByLayout(obj.layout), scenes: mergeScenes(obj.scenes) };
  } catch {
    return null;
  }
}

function fromRow(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    ip: row.ip,
    userAgent: row.user_agent,
    touchCapable: Boolean(row.touch_capable),
    touchOverride: row.touch_override === null ? null : Boolean(row.touch_override),
    presetId: row.preset_id,
    layout: parseLayout(row.layout),
    viewMode: row.view_mode === "standby" || row.view_mode === "grid" || row.view_mode === "touch" ? row.view_mode : null,
    sceneId: row.scene_id ?? null,
    standby: parseStandBy(row.standby),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  };
}

/** The `devices` table predates per-device layout overrides — add the column lazily
 *  instead of requiring an out-of-band migration. Safe to call repeatedly. */
let layoutColumnReady: Promise<void> | null = null;
function ensureLayoutColumn(): Promise<void> {
  if (!layoutColumnReady) {
    const add = (col: string) => d1Query(`ALTER TABLE devices ADD COLUMN ${col} TEXT`).then(() => undefined, () => undefined); // already exists
    layoutColumnReady = add("layout").then(() => add("view_mode")).then(() => add("scene_id")).then(() => add("standby"));
  }
  return layoutColumnReady;
}

export async function listDevices(): Promise<Device[]> {
  await ensureLayoutColumn();
  const rows = await d1Query<DeviceRow>("SELECT * FROM devices ORDER BY last_seen DESC");
  return rows.map(fromRow);
}

export async function getDevice(id: string): Promise<Device | null> {
  await ensureLayoutColumn();
  const rows = await d1Query<DeviceRow>("SELECT * FROM devices WHERE id = ?", [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function touchDevice(params: {
  id: string;
  ip: string | null;
  userAgent: string | null;
  touchCapable: boolean;
}): Promise<Device> {
  const now = Date.now();
  await d1Query(
    `INSERT INTO devices (id, name, status, ip, user_agent, touch_capable, touch_override, preset_id, first_seen, last_seen)
     VALUES (?, NULL, 'pending', ?, ?, ?, NULL, NULL, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       ip = excluded.ip,
       user_agent = excluded.user_agent,
       touch_capable = excluded.touch_capable,
       last_seen = excluded.last_seen`,
    [params.id, params.ip, params.userAgent, params.touchCapable ? 1 : 0, now, now]
  );
  const device = await getDevice(params.id);
  return device!;
}

export async function updateDevice(
  id: string,
  patch: Partial<Pick<Device, "name" | "status" | "touchOverride" | "presetId" | "layout" | "viewMode" | "sceneId" | "standby">>
): Promise<Device | null> {
  await ensureLayoutColumn();
  const sets: string[] = [];
  const values: unknown[] = [];

  if ("name" in patch) {
    sets.push("name = ?");
    values.push(patch.name);
  }
  if ("status" in patch) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if ("touchOverride" in patch) {
    sets.push("touch_override = ?");
    values.push(patch.touchOverride === null ? null : patch.touchOverride ? 1 : 0);
  }
  if ("presetId" in patch) {
    sets.push("preset_id = ?");
    values.push(patch.presetId);
  }
  if ("layout" in patch) {
    sets.push("layout = ?");
    values.push(patch.layout ? JSON.stringify(patch.layout) : null);
  }

  if ("viewMode" in patch) {
    sets.push("view_mode = ?");
    values.push(patch.viewMode);
  }
  if ("standby" in patch) {
    sets.push("standby = ?");
    values.push(patch.standby ? JSON.stringify(patch.standby) : null);
  }
  if ("sceneId" in patch) {
    sets.push("scene_id = ?");
    values.push(patch.sceneId);
  }

  if (sets.length === 0) return getDevice(id);

  values.push(id);
  await d1Query(`UPDATE devices SET ${sets.join(", ")} WHERE id = ?`, values);
  return getDevice(id);
}
