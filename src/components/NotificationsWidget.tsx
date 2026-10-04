"use client";

import { FitText } from "@/components/FitText";
import { useEffect, useState } from "react";
import type { WidgetSize } from "@/lib/presets";
import { useReportContent } from "@/lib/temporaryContent";

interface Notification {
  id: string;
  message: string;
  level: "info" | "action_needed" | "important";
  source: string | null;
  createdAt: number;
  read: boolean;
}

const LEVEL_COLOR: Record<Notification["level"], string> = {
  info: "bg-sky-400",
  action_needed: "bg-amber-400",
  important: "bg-red-400",
};

function timeAgo(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function NotificationsWidget({ size = "md" }: { size?: WidgetSize }) {
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setNotifications(data.notifications);
      } catch {
        // keep last known value on a transient failure
      }
    }
    load();
    const id = setInterval(load, 30 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function dismiss(id: string) {
    setNotifications((prev) => prev?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? null);
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
  }

  const unread = notifications?.filter((n) => !n.read) ?? [];
  useReportContent(unread.length > 0);

  if (!notifications) return <div className="text-sm text-[var(--muted)]">Loading…</div>;

  if (size === "sm") {
    if (unread.length === 0) return <div className="text-3xl font-semibold text-[var(--muted)]">0</div>;
    return <div className="text-4xl font-semibold tabular-nums">{unread.length}</div>;
  }

  if (unread.length === 0) {
    return <div className="text-sm text-[var(--muted)] text-center">You&apos;re all caught up</div>;
  }

  const count = size === "md" ? 2 : size === "lg" ? 5 : 10;

  return (
    <div className="w-full h-full flex flex-col gap-2">
      <div className="caps-label text-center">
        {unread.length} from Claude
      </div>
      <ul className="flex flex-col gap-2 overflow-hidden">
        {unread.slice(0, count).map((n) => (
          <li
            key={n.id}
            onClick={() => dismiss(n.id)}
            className="flex items-start gap-2 text-sm glass-card !rounded-2xl px-3 py-2 w-full cursor-pointer"
          >
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_COLOR[n.level]}`} />
            <span className="flex-1 min-w-0">
              <FitText lines={2}>{n.message}</FitText>
              <div className="text-[10px] text-[var(--muted)]">
                {n.source ? `${n.source} · ` : ""}
                {timeAgo(n.createdAt)}
              </div>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
