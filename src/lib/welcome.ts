// Coming home and leaving: spotting the change in `away`, and what the welcome screen says. Pure.
import type { Ev } from "./scenes.ts";
import type { Weather } from "./types.ts";
import { weatherIcon } from "./activities.ts";

export const WELCOME_MS = 8000, GOODBYE_MS = 3500;
export type AwayEdge = "left" | "back" | null;
/** away went true -> false = back; false -> true = left. The first reading (prev null) is never a change, so loading the page can't trigger either. */
export const awayEdge = (prev: boolean | null, next: boolean): AwayEdge => (prev === null || prev === next ? null : next ? "left" : "back");

export const greetingFor = (hour: number) => (hour < 5 ? "Still up?" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
export const welcomeGreeting = (hour: number) => (hour < 5 ? "Welcome back" : `${greetingFor(hour)}. Welcome back`);

export type WelcomeInfo = { greeting: string; weather: { temp: number; icon: string } | null; next: { title: string; at: number; startsIn: number } | null; unread: number };
export function welcomeInfo(o: { now: number; events: Ev[]; weather: Weather | null; unread: number }): WelcomeInfo {
  const w = o.weather?.current, h = new Date(o.now).getHours();
  const e = o.events.find((x) => x.end * 1000 > o.now);
  return {
    greeting: welcomeGreeting(h),
    weather: w ? { temp: Math.round(w.temperature_2m), icon: weatherIcon(w.weather_code, w.is_day === 0) } : null,
    next: e ? { title: e.title, at: e.start * 1000, startsIn: Math.round((e.start * 1000 - o.now) / 60000) } : null,
    unread: Math.max(0, Math.round(o.unread)),
  };
}
