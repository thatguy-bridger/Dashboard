"use client";

import { useCallback, useEffect, useState } from "react";
import type { HomeConfig, HomeEntity } from "@/lib/smarthome/types";

const PIN_KEY = "hb-control-pin";
const KIND_LABEL: Record<string, string> = { light: "Lights", switch: "Switches", media: "Speakers & TVs", scene: "Home Assistant scenes" };

/** Choose which devices show on the touch screen, what they're called, and which room they're in. */
export function SmartHomeManager() {
  const [pin, setPin] = useState("");
  const [needPin, setNeedPin] = useState(false);
  const [data, setData] = useState<{ provider: string; entities: HomeEntity[]; config: HomeConfig } | null>(null);
  const [cfg, setCfg] = useState<HomeConfig | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const headers = useCallback(() => ({ "x-control-pin": pin || (typeof localStorage !== "undefined" ? localStorage.getItem(PIN_KEY) ?? "" : ""), "Content-Type": "application/json" }), [pin]);

  const load = useCallback(async () => {
    setMsg(null);
    try {
      const res = await fetch("/api/home/config", { cache: "no-store", headers: headers() });
      const j = await res.json();
      if (res.status === 401) return setNeedPin(true);
      if (res.status === 403) return setMsg("Set CONTROL_PIN in Vercel first (real devices stay locked without it).");
      if (!res.ok) return setMsg(j.detail ?? j.error ?? "Couldn't load devices");
      setNeedPin(false);
      setData(j);
      setCfg(j.config);
    } catch {
      setMsg("Couldn't reach the dashboard");
    }
  }, [headers]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    const res = await fetch("/api/home/config", { method: "PUT", headers: headers(), body: JSON.stringify({ hidden: cfg.hidden, rooms: cfg.rooms, names: cfg.names }) });
    setSaving(false);
    setMsg(res.ok ? "Saved. The touch screen picks it up within a minute." : "Couldn't save");
  }

  async function deleteScene(id: string) {
    await fetch(`/api/home/scenes?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() });
    load();
  }

  if (needPin) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Control PIN"
          className="bg-transparent border border-[var(--surface-border)] rounded-lg px-3 py-2"
        />
        <button
          onClick={() => { try { localStorage.setItem(PIN_KEY, pin); } catch { /* ignore */ } load(); }}
          className="px-3 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)]"
        >
          Unlock device list
        </button>
        {msg && <span className="text-red-300">{msg}</span>}
      </div>
    );
  }
  if (!data || !cfg) return <div className="text-xs text-[var(--muted)]">{msg ?? "Loading devices…"}</div>;

  const rooms = [...new Set([...data.entities.map((e) => e.room), ...Object.values(cfg.rooms)].filter((r) => r && r !== "Scenes" && r !== "Speakers"))];
  const groups = ["light", "switch", "media", "scene"].map((k) => [k, data.entities.filter((e) => e.kind === k)] as const).filter(([, l]) => l.length);
  const toggleHidden = (id: string, show: boolean) => setCfg({ ...cfg, hidden: show ? cfg.hidden.filter((h) => h !== id) : [...cfg.hidden, id] });
  const setName = (id: string, v: string) => setCfg({ ...cfg, names: { ...cfg.names, [id]: v } });
  const setRoom = (id: string, v: string) => setCfg({ ...cfg, rooms: { ...cfg.rooms, [id]: v } });

  return (
    <div className="flex flex-col gap-5">
      <datalist id="hb-rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
      {groups.map(([kind, list]) => (
        <div key={kind}>
          <div className="caps-label mb-2">{KIND_LABEL[kind]}</div>
          <ul className="flex flex-col gap-1.5">
            {list.map((e) => {
              const shown = !cfg.hidden.includes(e.id);
              return (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={shown} onChange={(ev) => toggleHidden(e.id, ev.target.checked)} title="Show on the touch screen" />
                  <input
                    value={cfg.names[e.id] ?? ""}
                    onChange={(ev) => setName(e.id, ev.target.value)}
                    placeholder={e.name}
                    className={`bg-transparent border border-[var(--surface-border)] rounded px-2 py-1 w-56 ${shown ? "" : "opacity-40"}`}
                  />
                  {(kind === "light" || kind === "switch") && (
                    <input
                      list="hb-rooms"
                      value={cfg.rooms[e.id] ?? ""}
                      onChange={(ev) => setRoom(e.id, ev.target.value)}
                      placeholder={e.room === "Other" ? "Room (e.g. Living Room)" : e.room}
                      className="bg-transparent border border-[var(--surface-border)] rounded px-2 py-1 w-44"
                    />
                  )}
                  <span className="text-[10px] text-[var(--muted)] truncate">{e.id}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {cfg.scenes.length > 0 && (
        <div>
          <div className="caps-label mb-2">Scenes saved from the touch screen</div>
          <ul className="flex flex-col gap-1">
            {cfg.scenes.map((s) => (
              <li key={s.id} className="flex items-center gap-3 text-sm">
                <span>{s.name}</span>
                <span className="text-[10px] text-[var(--muted)]">{Object.keys(s.lights).length} lights</span>
                <button onClick={() => deleteScene(s.id)} className="text-xs px-2 py-0.5 rounded border border-red-400/30 text-red-300">Delete</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="text-xs px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] disabled:opacity-50">
          {saving ? "Saving…" : "Save devices"}
        </button>
        {msg && <span className="text-xs text-[var(--muted)]">{msg}</span>}
      </div>
    </div>
  );
}
