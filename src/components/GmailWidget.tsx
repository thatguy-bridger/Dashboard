"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";
import { useDisplayMode } from "@/lib/useDisplayMode";

interface GmailMessage {
  from: string;
  subject: string;
  snippet: string;
  labelColor: string | null;
}

interface GmailData {
  connected: boolean;
  unreadCount: number;
  messages: GmailMessage[];
}

export function GmailWidget({ size = "md" }: { size?: WidgetSize }) {
  const [data, setData] = useState<GmailData | null>(null);
  const displayMode = useDisplayMode();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/gmail", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 2 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data) return <div className="text-sm text-[var(--muted)]">Loading Gmail…</div>;
  if (!data.connected) return <div className="text-sm text-[var(--muted)]">Google not connected</div>;

  if (size === "sm") {
    return (
      <div className="flex flex-col items-center">
        <div className="text-2xl font-medium">{data.unreadCount}</div>
        <div className="caps-label">unread</div>
      </div>
    );
  }

  if (data.messages.length === 0) {
    return <div className="text-sm text-[var(--muted)]">Inbox is empty</div>;
  }

  const count = size === "md" ? 3 : size === "lg" ? 5 : 8;

  return (
    <div className="w-full max-w-lg">
      <div className="caps-label mb-3 text-center">
        Gmail · {data.unreadCount} unread
      </div>
      <ul className="flex flex-col gap-2">
        {data.messages.slice(0, count).map((m, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm glass-card !rounded-2xl px-3 py-2 w-full"
          >
            {displayMode === "image" && (
              <span
                className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                style={{ background: m.labelColor ?? "transparent" }}
              />
            )}
            <div className="min-w-0">
              <div className="flex justify-between gap-3">
                <span className="font-medium truncate">{m.from}</span>
              </div>
              <div className="text-[var(--muted)] text-xs truncate">{m.subject}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
