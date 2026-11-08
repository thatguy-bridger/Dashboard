import { BUILTIN } from "../slots.ts";
import type { InfoSource } from "./types.ts";

/** The schedule: the next-event pill, the Next Up strip, and the "today" page. */
export const agenda: InfoSource = {
  id: "agenda",
  items: (c) => BUILTIN.flatMap((p) => p({ now: c.now, scene: c.scene, events: c.events, info: [] })),
  score: (c) => {
    const e = c.events.find((x) => !x.allDay && (x.tier ?? 1) >= 1);
    if (!e) return 0;
    const m = (e.start * 1000 - c.now) / 60000;
    return m <= c.soonLeadMin ? 90 : m <= 60 ? 60 : m <= 180 ? 30 : 0;
  },
  page: { id: "today", title: "Today", has: (c) => c.events.some((e) => new Date(e.start * 1000).toDateString() === new Date(c.now).toDateString()) },
};
