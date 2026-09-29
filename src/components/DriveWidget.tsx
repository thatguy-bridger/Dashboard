"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

interface DriveData {
  connected: boolean;
  files: DriveFile[];
}

function formatAge(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (60 * 24))}d ago`;
}

export function DriveWidget({ size = "md" }: { size?: WidgetSize }) {
  const [data, setData] = useState<DriveData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/drive", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data) return <div className="text-sm text-[var(--muted)]">Loading Drive…</div>;
  if (!data.connected) return <div className="text-sm text-[var(--muted)]">Google not connected</div>;
  if (data.files.length === 0) return <div className="text-sm text-[var(--muted)]">No recent files</div>;

  const count = size === "sm" ? 1 : size === "md" ? 3 : size === "lg" ? 5 : 8;

  return (
    <div className="w-full max-w-lg">
      <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-3 text-center">
        Recent Drive files
      </div>
      <ul className="flex flex-col gap-2">
        {data.files.slice(0, count).map((f) => (
          <li
            key={f.id}
            className="flex justify-between gap-3 text-sm border-t border-[var(--surface-border)] pt-2 first:border-t-0 first:pt-0"
          >
            <span className="truncate">{f.name}</span>
            <span className="text-[var(--muted)] text-xs whitespace-nowrap">{formatAge(f.modifiedTime)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
