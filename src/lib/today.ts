// The Today page: whatever matters most right now. Every kind of information scores itself against the moment (same 0 to 100 idea as the sources);
// the page shows the highest scorers, biggest first, and re-ranks as things change. Pure, so it can be tested.
import type { SourceCtx } from "./sources/types.ts";
import { schoolOf } from "./sources/school.ts";
import { parseMail } from "./sources/mail.ts";
import { parseJournal } from "./sources/journal.ts";
import { parseCar } from "./sources/car.ts";
import { parseLife } from "./sources/life.ts";

export type TodayId = "next" | "school" | "music" | "weather" | "mail" | "journal" | "car" | "life";
export type TodayCard = { id: TodayId; score: number };
export type TodayExtra = { rainSoon?: boolean; severe?: boolean };

export function todayCards(c: SourceCtx, x: TodayExtra = {}, max = 6): TodayCard[] {
  const out: TodayCard[] = [];
  const hour = new Date(c.now).getHours();

  const ev = c.events.find((e) => e.end * 1000 > c.now);
  if (ev) { const m = (ev.start * 1000 - c.now) / 60000; out.push({ id: "next", score: m <= 0 ? 72 : m <= 30 ? 88 : m <= 120 ? 62 : 48 }); }

  const s = schoolOf(c);
  if (s) {
    const soon = s.next && (s.next.start * 1000 - c.now) / 60000 <= 30;
    out.push({ id: "school", score: soon ? 82 : s.now ? 74 : s.periods.length && hour >= 6 && hour < 16 ? 36 : 12 });
  }

  const m = c.music;
  if (m && m.track) out.push({ id: "music", score: m.playing ? 90 : 28 });

  if (c.weather?.current) out.push({ id: "weather", score: x.severe ? 85 : x.rainSoon ? 78 : hour >= 5 && hour < 9 ? 60 : 46 });

  const mail = parseMail(c.extra.mail);
  if (mail) {
    const mis = mail.missionaries.reduce((a, y) => a + y.unread, 0);
    if (mail.priority > 0 || mis > 0) out.push({ id: "mail", score: 64 });
    else if (mail.unread >= 10) out.push({ id: "mail", score: 38 });
    else if (mail.unread > 0) out.push({ id: "mail", score: 22 });
  }

  const j = parseJournal(c.extra.journal);
  if (j && j.due && !j.wroteToday) out.push({ id: "journal", score: hour >= 18 ? 58 : 30 });

  const car = parseCar(c.extra.car);
  if (car) {
    const low = (car.fuelPct != null && car.fuelPct <= 15) || (car.batteryPct != null && car.batteryPct <= 20 && !car.charging);
    if (low) out.push({ id: "car", score: 72 }); else if (car.locked === false) out.push({ id: "car", score: 50 });
  }

  if (parseLife(c.extra.life).length) out.push({ id: "life", score: 20 });

  return out.sort((a, b) => b.score - a.score).slice(0, max);
}
