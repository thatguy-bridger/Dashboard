"use client";

import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";

interface GmailMessage {
  from: string;
  subject: string;
  snippet: string;
}

interface GmailData {
  connected: boolean;
  unreadCount: number;
  messages: GmailMessage[];
}

export function GmailWidget({ size = "md" }: { size?: WidgetSize }) {
  const [data, setData] = useState<GmailData | null>(null);

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
        <div className="text-xs uppercase tracking-widest text-[var(--muted)]">unread</div>
      </div>
    );
  }

  if (data.messages.length === 0) {
    return <div className="text-sm text-[var(--muted)]">Inbox is empty</div>;
  }

  const count = size === "md" ? 3 : size === "lg" ? 5 : 8;

  return (
    <div className="w-full max-w-lg">
      <div className="text-xs uppercase tracking-widest text-[var(--muted)] mb-3 text-center">
        Gmail · {data.unreadCount} unread
      </div>
      <ul className="flex flex-col gap-2">
        {data.messages.slice(0, count).map((m, i) => (
          <li key={i} className="text-sm border-t border-[var(--surface-border)] pt-2 first:border-t-0 first:pt-0">
            <div className="flex justify-between gap-3">
              <span className="font-medium truncate">{m.from}</span>
            </div>
            <div className="text-[var(--muted)] text-xs truncate">{m.subject}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
