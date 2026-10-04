"use client";

import { useCallback, useEffect, useState } from "react";

interface Cal { id: string; name: string; account: string; color: string | null; events: number }

/** Choose which of the Mac's calendars appear on the dashboard (hide the noisy ones:
 *  school schedules, due dates, moon phases). Unchecked = hidden. */
export function CalendarPicker() {
  const [data, setData] = useState<{ calendars: Cal[]; hidden: string[]; updatedAt: number | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/calendar/calendars", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(id: string, show: boolean) {
    if (!data) return;
    const hidden = show ? data.hidden.filter((h) => h !== id) : [...data.hidden, id];
    setData({ ...data, hidden });
    setSaving(true);
    await fetch("/api/calendar/calendars", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden }),
    });
    setSaving(false);
  }

  if (!data) return <div className="text-xs text-[var(--muted)]">Loading calendars…</div>;
  if (!data.updatedAt) {
    return (
      <p className="text-xs text-[var(--muted)]">
        No Mac sync yet. Build and install the Calendar Sync tool (tools/calendar-sync) on your Mac and every calendar from
        the Calendar app will show up here to pick from.
      </p>
    );
  }

  const byAccount = new Map<string, Cal[]>();
  for (const c of data.calendars) byAccount.set(c.account, [...(byAccount.get(c.account) ?? []), c]);
  const ago = Math.round((Date.now() - data.updatedAt) / 60_000);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--muted)]">
        Synced from your Mac {ago < 2 ? "just now" : ago < 120 ? `${ago} min ago` : `${Math.round(ago / 60)} h ago`}. Untick a calendar to hide it
        from every screen.{saving ? " Saving…" : ""}
      </p>
      {[...byAccount.entries()].map(([account, cals]) => (
        <div key={account}>
          <div className="caps-label mb-2">{account}</div>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {cals.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                  <input type="checkbox" checked={!data.hidden.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color ?? "#888" }} />
                  <span className="truncate">{c.name}</span>
                  <span className="text-[10px] text-[var(--muted)] ml-auto">{c.events}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
