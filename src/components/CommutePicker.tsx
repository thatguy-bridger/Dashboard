"use client";

import { useEffect, useState } from "react";

interface Place { label: string; lat: number; lon: number }

/** Search for the address you commute to; the top bar then shows live drive time from Home. */
export function CommutePicker() {
  const [current, setCurrent] = useState<Place | null | undefined>(undefined);
  const [hasHome, setHasHome] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setCurrent(d.settings.commute ?? null);
        setHasHome(Boolean(d.settings.mapHome));
      })
      .catch(() => setCurrent(null));
  }, []);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/traffic/search?q=${encodeURIComponent(q.trim())}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Search failed");
        setResults(j.results ?? []);
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function save(place: Place | null) {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commute: place }),
    });
    setCurrent(place);
    setQ("");
    setResults([]);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[var(--muted)]">
        The top bar shows live drive time here on weekday mornings (from Home) and afternoons (back to Home).
        {!hasHome && " Set a Home address in the map settings below first, since it's the starting point."}
      </p>
      {current ? (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">{current.label}</div>
          <button onClick={() => save(null)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--surface-border)] text-[var(--muted)]">
            Clear
          </button>
        </div>
      ) : (
        current === null && <div className="text-sm text-[var(--muted)]">No commute set.</div>
      )}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search an address or place…"
        className="bg-transparent border border-[var(--surface-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      />
      {busy && <div className="text-xs text-[var(--muted)]">Searching…</div>}
      {error && <div className="text-xs text-red-300">{error}</div>}
      {results.length > 0 && (
        <ul className="flex flex-col rounded-lg border border-[var(--surface-border)] overflow-hidden">
          {results.map((r, i) => (
            <li key={i}>
              <button onClick={() => save(r)} className="w-full text-left text-sm px-3 py-2 hover:bg-white/5 border-t border-[var(--surface-border)] first:border-t-0">
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
