"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEVICE_DEFAULTS, makeDeviceId, mergeDevice, resolveDevice, type DeviceConfig } from "./device";
import type { Call } from "./useApi";

const ID_KEY = "dash-device", CFG_KEY = "dash-device-config";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} };

function deviceId(): string {
  const have = read(ID_KEY);
  if (have && have.length >= 8) return have;
  const id = makeDeviceId(crypto.getRandomValues(new Uint8Array(12)));
  write(ID_KEY, id);
  return id;
}

/** This screen's own configuration. The server is the authority: it's re-read every ~15 s and applied live; changes made here are saved at once.
 *  If the server can't be reached the last known config (kept in localStorage) keeps being used, and pings keep retrying quietly. */
export function useDevice(o: { call: Call; unlocked: boolean; scene: string; mode: string; ver: string | null; mock?: Partial<DeviceConfig> | null }) {
  const [cfg, setCfg] = useState<DeviceConfig>(() => {                    // the cached (or mock) config is used from the very first frame, so a reload never flashes the wrong view
    if (o.mock) return resolveDevice(o.mock);
    if (typeof localStorage === "undefined") return DEVICE_DEFAULTS;
    const cached = read(CFG_KEY);
    if (cached) { try { return resolveDevice(JSON.parse(cached)); } catch {} }
    return DEVICE_DEFAULTS;
  });
  const [ready, setReady] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const id = useRef("");
  const pending = useRef<Partial<DeviceConfig> | null>(null);
  const live = useRef(o); live.current = o;
  const cfgRef = useRef(cfg); cfgRef.current = cfg;

  // first paint: the cached config (so a reload or an offline start keeps its role), or the mock's
  useEffect(() => {
    id.current = deviceId();
    if (o.mock) { setCfg(resolveDevice(o.mock)); setReady(true); return; }
    const cached = read(CFG_KEY);
    if (cached) { try { setCfg(resolveDevice(JSON.parse(cached))); } catch {} }
    setReady(true);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const post = useCallback(async (body: Record<string, unknown>): Promise<DeviceConfig | null> => {
    try {
      const r = await live.current.call("/api/device", { method: "POST", body: JSON.stringify({ id: id.current, ...body }) });
      if (!r.ok) throw new Error(String(r.status));
      const c = resolveDevice(await r.json());
      write(CFG_KEY, JSON.stringify(c)); setOnline(true); setLastSync(Date.now());
      return c;
    } catch (e) { if ((e as Error).message !== "locked") setOnline(false); return null; }
  }, []);

  const ping = useCallback(async () => {
    const l = live.current;
    if (!l.unlocked || l.mock) return;
    if (pending.current) { const c = await post({ op: "self", config: pending.current }); if (c) { pending.current = null; setCfg(c); return; } }     // a change that couldn't be saved is retried first
    const c = await post({ op: "ping", info: { ua: navigator.userAgent, w: window.innerWidth, h: window.innerHeight, scene: l.scene, mode: l.mode, ver: l.ver ?? undefined, name: cfgRef.current.name || undefined } });
    if (c && !pending.current) setCfg((prev) => (JSON.stringify(prev) === JSON.stringify(c) ? prev : c));      // the server's answer is authoritative; unchanged means no re-render
  }, [post]);

  useEffect(() => { if (!ready || !o.unlocked || o.mock) return; ping(); const t = setInterval(ping, 15000); return () => clearInterval(t); }, [ready, o.unlocked, o.mock, ping]);

  /** Change this screen's settings: applied immediately, saved to the server (retried if it fails). */
  const save = useCallback(async (patch: Partial<DeviceConfig>) => {
    const next = mergeDevice(cfgRef.current, patch);
    setCfg(next); write(CFG_KEY, JSON.stringify(next));
    if (live.current.mock) return;
    pending.current = { ...(pending.current ?? {}), ...patch };
    const c = await post({ op: "self", config: pending.current });
    if (c) { pending.current = null; setCfg(c); }
  }, [post]);

  return { cfg, ready, save, ping, lastSync, online, id: id.current };
}
