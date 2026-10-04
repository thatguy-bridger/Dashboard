"use client";

import { FitText } from "@/components/FitText";
import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";
import { useDisplayMode } from "@/lib/useDisplayMode";
import { driveTypeColor } from "@/lib/driveColors";

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  mimeType: string;
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
  const displayMode = useDisplayMode();

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
      <div className="caps-label mb-3 text-center">
        Recent Drive files
      </div>
      <ul className="flex flex-col gap-2">
        {data.files.slice(0, count).map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 text-sm glass-card !rounded-2xl px-3 py-2 w-full"
          >
            <span className="flex items-center gap-2 min-w-0">
              {displayMode === "image" && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: driveTypeColor(f.mimeType) }}
                />
              )}
              <FitText className="min-w-0">{f.name}</FitText>
            </span>
            <span className="text-[var(--muted)] text-xs whitespace-nowrap">{formatAge(f.modifiedTime)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
