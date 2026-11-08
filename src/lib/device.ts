// Per-screen configuration: each connected screen has its own role and view. The server (Supabase) is the source of truth; this is the pure part:
// defaults, tolerant parsing, merging a patch, and what a config means for the page. No React, no I/O.

export type DeviceRole = "display" | "control";
export type DeviceView = "auto" | "standby" | "music" | "timeline" | "calm" | "home";
export type DeviceDim = "auto" | "never";
export type DeviceConfig = { name: string; role: DeviceRole; view: DeviceView; locked: boolean; dim: DeviceDim };

export const DEVICE_DEFAULTS: DeviceConfig = { name: "", role: "display", view: "auto", locked: false, dim: "auto" };
export const ROLES: DeviceRole[] = ["display", "control"];
export const VIEWS: DeviceView[] = ["auto", "standby", "music", "timeline", "calm", "home"];
export const DIMS: DeviceDim[] = ["auto", "never"];
export const NAME_MAX = 40;

/** Only valid fields of a patch (anything else is dropped). */
export function cleanPatch(raw: unknown): Partial<DeviceConfig> {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Partial<DeviceConfig> = {};
  if (typeof o.name === "string") out.name = o.name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  if (ROLES.includes(o.role as DeviceRole)) out.role = o.role as DeviceRole;
  if (VIEWS.includes(o.view as DeviceView)) out.view = o.view as DeviceView;
  if (typeof o.locked === "boolean") out.locked = o.locked;
  if (DIMS.includes(o.dim as DeviceDim)) out.dim = o.dim as DeviceDim;
  return out;
}
/** A config from whatever the server (or the cache) returned: defaults for everything missing or invalid. */
export const resolveDevice = (raw: unknown): DeviceConfig => ({ ...DEVICE_DEFAULTS, ...cleanPatch(raw) });
export const mergeDevice = (prev: DeviceConfig, patch: unknown): DeviceConfig => ({ ...prev, ...cleanPatch(patch) });

/** The panel controller UI is used for role "control" and also when the view is "home". */
export const isControl = (c: DeviceConfig) => c.role === "control" || c.view === "home";

export type Forced = { kind: "auto" } | { kind: "scene"; scene: "idle" | "music" | "day" } | { kind: "calm" } | { kind: "control" };
/** What a display is pinned to ("auto" = the situational page decides). */
export function forcedView(c: DeviceConfig): Forced {
  if (isControl(c)) return { kind: "control" };
  switch (c.view) {
    case "standby": return { kind: "scene", scene: "idle" };
    case "music": return { kind: "scene", scene: "music" };
    case "timeline": return { kind: "scene", scene: "day" };
    case "calm": return { kind: "calm" };
    default: return { kind: "auto" };
  }
}

/** A random id (hex) from the given bytes (injected so it can be tested; the page passes crypto.getRandomValues). */
export const makeDeviceId = (bytes: ArrayLike<number>) => Array.from(bytes, (b) => (b & 255).toString(16).padStart(2, "0")).join("");
export const validDeviceId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);

export type DeviceInfo = { ua?: string; w?: number; h?: number; scene?: string; mode?: string; ver?: string; name?: string };
/** What the page tells the server about itself, with lengths capped. */
export function sanitizeInfo(raw: unknown): DeviceInfo {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.min(20000, Math.max(0, Math.round(v))) : undefined);
  return { ua: s(o.ua, 200), w: n(o.w), h: n(o.h), scene: s(o.scene, 20), mode: s(o.mode, 10), ver: s(o.ver, 40), name: s(o.name, NAME_MAX) };
}
