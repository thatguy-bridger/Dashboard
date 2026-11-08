// Turns what the page knows into island activities, reusing the info sources' parsers and the same 0 to 100 idea as the focus score.
import { until } from "./format.ts";
import type { Activity } from "./island.ts";
import { parseMail } from "./sources/mail.ts";
import { parseJournal } from "./sources/journal.ts";
import { parseCar } from "./sources/car.ts";
import { parseBattery } from "./sources/battery.ts";
import type { SourceCtx } from "./sources/types.ts";
import type { SlotItem } from "./slots.ts";
import type { PredMusic } from "./predict.ts";

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function weatherIcon(code: number, night: boolean): string {
  if (code === 0) return night ? "moon" : "sun";
  if (code <= 2) return night ? "cloud" : "cloud-sun";
  if (code === 3) return "cloud";
  if (code >= 95) return "bolt";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 45 && code <= 48) return "fog";
  return "cloud-rain";
}

export function buildActivities(c: SourceCtx & { music: PredMusic | null }, extra: { takeover?: SlotItem | null; lightsOn?: number; musicLights?: boolean } = {}): Activity[] {
  const out: Activity[] = [];
  const now = c.now;

  // music: playing is pressing, paused a moment ago less so
  const m = c.music;
  if (m && m.track && (m.playing || m.ended || now - m.at < 90_000)) out.push({ id: "music", kind: "music", score: m.playing ? 80 : 45, page: "music", icon: "note", label: m.track, value: m.artist, tint: m.palette?.[0] });

  // the next timed event: a thin calm pill most of the day, a countdown as it nears, urgent when it is about to start
  const e = c.events.find((x) => !x.allDay);
  if (e) {
    const mins = (e.start * 1000 - now) / 60000;
    const running = mins <= 0 && e.end * 1000 > now;
    const score = running ? 85 : mins <= c.soonLeadMin ? 90 : mins <= 60 ? 70 : mins <= 180 ? 40 : 20;
    out.push({ id: "event", kind: "event", score, page: "calendar", icon: "calendar", label: short(e.title, 28), value: running ? "now" : until(e.start, now), urgent: running || mins <= 5, tint: e.color });
  }

  if (c.away) out.push({ id: "away", kind: "away", score: 55, page: "home", icon: "home", label: "Away", value: "away" });

  const mail = parseMail(c.extra.mail);
  if (mail) {
    const pressing = mail.priority > 0 || mail.missionaries.some((x) => x.unread > 0);
    if (pressing) out.push({ id: "mail", kind: "mail", score: 60, page: "mail", icon: "mail", label: mail.priority > 0 ? `${mail.priority} that matter` : "Missionary mail", value: String(mail.priority || mail.unread) });
    else if (mail.unread > 0) out.push({ id: "mail", kind: "mail", score: 22, page: "mail", icon: "mail", label: "Mail", value: String(mail.unread) });
  }

  const j = parseJournal(c.extra.journal);
  if (j?.due) out.push({ id: "journal", kind: "journal", score: 45, page: "journal", icon: "book", label: "Journal", value: "tonight" });

  const car = parseCar(c.extra.car);
  if (car) {
    const low = (car.fuelPct != null && car.fuelPct <= 15) || (car.batteryPct != null && car.batteryPct <= 20 && !car.charging);
    const pct = car.fuelPct ?? car.batteryPct;
    out.push({ id: "car", kind: "car", score: low ? 65 : 12, page: "home", icon: "car", label: low ? "Car is low" : "Car", value: pct != null ? `${Math.round(pct)}%` : undefined });
  }
  const bat = parseBattery(c.extra.battery);
  if (bat) { const low = bat.pct <= 20 && !bat.charging; out.push({ id: "battery", kind: "battery", score: low ? 55 : 10, page: "home", icon: "battery", label: low ? "Tablet battery low" : "Tablet", value: `${Math.round(bat.pct)}%` }); }

  if (extra.musicLights) out.push({ id: "musiclights", kind: "musiclights", score: 30, page: "home", icon: "note", label: "Music lights", value: "on" });
  if ((extra.lightsOn ?? 0) > 0) out.push({ id: "lights", kind: "lights", score: 18, page: "home", icon: "bulb", label: "Lights", value: String(extra.lightsOn) });

  if (extra.takeover) out.push({ id: `alert:${extra.takeover.id}`, kind: "alert", score: 100, page: "any", icon: (extra.takeover.icon as string) || "alert", label: short(extra.takeover.title, 34), detail: extra.takeover.detail, urgent: true });

  const w = c.weather?.current;
  if (w) out.push({ id: "weather", kind: "weather", score: 10, page: "weather", icon: weatherIcon(w.weather_code, w.is_day === 0), label: "Weather", value: `${Math.round(w.temperature_2m)}°` });
  return out;
}
