"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

const PIN_KEY = "dash-pin";

export function useApi() {
  const [pin, setPin] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => { try { setPin(localStorage.getItem(PIN_KEY)); } catch {} setChecked(true); }, []);
  const call = useCallback(async (path: string, init?: RequestInit) => {
    const r = await fetch(path, { ...init, headers: { "x-control-pin": pin ?? "", "Content-Type": "application/json" }, cache: "no-store" });
    if (r.status === 401) { try { localStorage.removeItem(PIN_KEY); } catch {} setPin(null); throw new Error("locked"); }
    return r;
  }, [pin]);
  const unlock = useCallback(async (p: string) => {
    const r = await fetch("/api/unlock", { method: "POST", headers: { "x-control-pin": p } });
    if (r.ok) { try { localStorage.setItem(PIN_KEY, p); } catch {} setPin(p); return true; }
    return false;
  }, []);
  return useMemo(() => ({ pin, checked, call, unlock }), [pin, checked, call, unlock]);   // stable: effects that depend on it must not restart every render
}
export type Call = (path: string, init?: RequestInit) => Promise<Response>;
export const post = (call: Call, body: Record<string, unknown>) => call("/api/act", { method: "POST", body: JSON.stringify(body) }).catch(() => null);
