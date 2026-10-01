"use client";

import { useEffect, useRef, useState } from "react";
import type { FavoriteTeam } from "@/lib/settings";

/** Type-ahead, multi-select favorite-team picker backed by TheSportsDB search. */
export function TeamSearchSelect({
  value,
  onChange,
}: {
  value: FavoriteTeam[];
  onChange: (teams: FavoriteTeam[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FavoriteTeam[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/sports/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => (res.ok ? res.json() : { teams: [] }))
        .then((data) => setResults(data.teams ?? []))
        .catch(() => setResults([]));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function addTeam(team: FavoriteTeam) {
    if (value.some((t) => t.id === team.id)) return;
    onChange([...value, team]);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function removeTeam(id: string) {
    onChange(value.filter((t) => t.id !== id));
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((team) => (
            <span
              key={team.id}
              className="flex items-center gap-1.5 text-xs pl-2.5 pr-1.5 py-1 rounded-full border border-[var(--surface-border)] text-[var(--foreground)]"
            >
              {team.name}
              <button
                onClick={() => removeTeam(team.id)}
                className="w-4 h-4 rounded-full hover:bg-red-500/20 hover:text-red-300 text-[var(--muted)] leading-none flex items-center justify-center"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Full team name (e.g. Los Angeles Lakers)…"
          className="bg-transparent border border-[var(--surface-border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)] w-full"
        />
        {open && results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto glass-panel border border-[var(--surface-border)] rounded-lg py-1">
            {results.map((team) => (
              <button
                key={team.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTeam(team)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 flex items-center justify-between gap-2"
              >
                <span className="truncate">{team.name}</span>
                <span className="text-xs text-[var(--muted)] shrink-0">{team.league ?? team.sport}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
