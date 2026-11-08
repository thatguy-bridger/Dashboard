// A local test harness: fake data for each situation, used only when the build is made with NEXT_PUBLIC_DASH_MOCK=1 (never on Vercel).
import type { ScreenData } from "./types";

export type Scenario = "idle" | "music" | "paused" | "soon" | "morning" | "night" | "away" | "offline" | "nightmusic" | "day" | "calm" | "takeover" | "busy";
const LONG_EVENT = "Alta Service Club: save Tiny Tim's headcount, hours, thank-you, and photos in one folder";
const LONG_SONG = "Popular (with Playboi Carti & Madonna) - From The Idol Vol. 1 (Music from the HBO Original Series)";

export function mockData(s: Scenario, now: number, long: boolean, pulseMin?: number, withLyrics = true): ScreenData {
  const sec = Math.floor(now / 1000), m = (min: number) => sec + min * 60;
  const ev = (title: string, startMin: number, durMin: number, color: string, extra = {}) => ({ title, start: m(startMin), end: m(startMin + durMin), color, ...extra });
  const events = [
    ev(long ? "Rebroadcast: Worldwide Devotional for Young Adults - Churchwide Events" : "Chemistry", s === "soon" ? 8 : 130, 60, "#b48cff", { location: "Room 214" }),
    ev("(Dad's Ward) Church - Second Sunday", 600, 180, "#ffd60a"),
    ev(long ? LONG_EVENT : "Service club", 720, 60, "#ff8a65"),
    ev("(Mom's Ward) Church - Second Sunday", 900, 180, "#ffd60a"),
    ev("Mission prep", 1000, 60, "#ffd60a"),
  ];
  const music = (playing: boolean) => ({ trackId: "mock1", playing, track: long ? LONG_SONG : "NEW DROP", artist: "Don Toliver", album: "Hardstone Psycho", art: "/mock-art-a.svg", progress: 60 + (Math.floor(now / 1000) % 90), duration: 217, at: now - (playing ? 0 : 20000), device: "Bridger's Speakers", volume: 0.4, next: { track: "Another Song", artist: "Someone", art: "/mock-art-b.svg" } });
  // fake synced lyrics around 1:40 (position 100 s at the moment the data is generated, then the clock moves on)
  const lines: [number, string][] = [[84, "I been out here workin' all night"], [89, "Tellin' you the things you never heard"], [94, ""], [98, "Lights down low, I'm moving like a ghost"], [103, long ? "Every single word that you ever said still echoes through the hallway of my head tonight" : "Every word you said is on repeat"], [108, "Hold me closer, hold me tight"], [113, "Say you'll stay until the morning light"], [118, "Never let me go"], [124, "(instrumental)"]];
  const lyrics = withLyrics ? { id: "mock1", lines: lines.map(([t, x]) => [t, x] as [number, string]) } : null;
  const school = { day: "A", now: { period: "3", class: "Chemistry", room: "214", start: m(-20), end: m(30) }, next: { period: "4", class: "Pre-Calculus", room: "118", start: m(35), end: m(85) }, periods: [
    { period: "1", class: "English 11", room: "102", start: m(-170), end: m(-120) }, { period: "2", class: "Seminary", room: "Annex", start: m(-110), end: m(-60) }, { period: "3", class: "Chemistry", room: "214", start: m(-20), end: m(30) },
    { period: "4", class: "Pre-Calculus", room: "118", start: m(35), end: m(85) }, { period: "5", class: "Lunch", start: m(90), end: m(120) }, { period: "6", class: "US History", room: "301", start: m(125), end: m(175) }] };
  const extra: Record<string, unknown> = (s === "calm" || s === "busy" || s === "takeover" || s === "day" || s === "idle")
    ? { school, mail: { unread: 12, priority: s === "busy" ? 2 : 0, missionaries: [{ name: "Elder Jones", unread: s === "busy" ? 1 : 0, last: "Week 14: a miracle in Valparaiso" }, { name: "Sister Smith", unread: 0, last: "Transfer news" }], recent: [{ from: "Coach Miller", subject: "Practice moved to 4:30" }, { from: "Alta High", subject: "Picture retake day" }] },
        journal: { due: s === "busy", wroteToday: false, streak: 12, best: 40, prompt: "What made you laugh today?" }, life: { stats: [{ label: "Music today", value: "2h 10m", detail: "20 min more than usual", icon: "note" }, { label: "Steps", value: "6,412", detail: "On track", icon: "walk" }, { label: "Mail", value: "34", detail: "9 that mattered", icon: "mail" }, { label: "Time at home", value: "5h 20m", icon: "home" }] },
        car: { fuelPct: s === "busy" ? 9 : 62, rangeMi: 240, locked: s === "busy" ? false : true, lastDrive: { miles: 11.2, minutes: 24 } }, battery: { pct: s === "busy" ? 14 : 80, charging: false } }
    : {};
  const info = s === "takeover" ? [{ id: "garage", zone: "takeover", title: "Garage door has been open for 20 minutes", detail: "Tap to close it from Permuta", icon: "alert", priority: 90 }] : [];
  const dayEvents = [ev("English 11", -170, 50, "#7c8cff"), ev("Seminary", -110, 50, "#ffd60a"), ev("Chemistry", -20, 50, "#b48cff", { location: "Room 214", kind: "school" }), ev("Pre-Calculus", 35, 50, "#7c8cff", { kind: "school" }), ev("US History", 125, 50, "#7c8cff", { kind: "school" }), ev("Basketball practice", 240, 90, "#ff8a65")];
  const hr = new Date(now).getHours();
  return {
    screen: { widgets: ["clock", "weather", "agenda", "music"], calmAfterSec: 0, pageSec: 6, ...(pulseMin ? { pulseMin } : {}) }, theme: null,
    agenda: { events: (s === "day" || s === "busy" ? dayEvents : events).filter((e) => e.end > sec) },
    music: s === "music" || s === "nightmusic" ? music(true) : s === "paused" ? music(false) : null,
    lyrics, info: info as never, extra,
    status: { away: s === "away", at: s === "offline" ? sec - 900 : sec - 5 },
    weather: { current: { temperature_2m: 43, weather_code: 0, is_day: hr >= 7 && hr < 19 ? 1 : 0 }, daily: { time: [0, 1, 2, 3, 4].map((i) => new Date(now + i * 864e5).toISOString().slice(0, 10)), temperature_2m_max: [53, 64, 67, 61, 59], temperature_2m_min: [36, 38, 45, 51, 48], weather_code: [0, 1, 2, 3, 0] } },
    updatedAt: new Date(now).toISOString(), now,
  };
}
