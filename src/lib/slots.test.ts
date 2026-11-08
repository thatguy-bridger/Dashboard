import test from "node:test";
import assert from "node:assert/strict";
import { collectSlots, normalizeInfo, railFor, BUILTIN, type SlotItem } from "./slots.ts";
import type { Ev } from "./scenes.ts";

const now = new Date(2026, 10, 7, 13, 0).getTime();
const ev = (title: string, min: number): Ev => ({ title, start: now / 1000 + min * 60, end: now / 1000 + (min + 30) * 60, color: "#ff0000" });
const ctx = (scene: SlotItem["scenes"] extends (infer S)[] | undefined ? S : never, over = {}) => ({ now, scene, events: [ev("A", 90), ev("B", 200), ev("C", 300), ev("D", 400), ev("E", 500)], info: [] as SlotItem[], ...over });

test("idle gets the next-event pill and a strip of the next four; music gets only the pill", () => {
  const idle = collectSlots(ctx("idle"));
  assert.equal(idle.pills.length, 1); assert.equal(idle.pills[0].title, "A"); assert.equal(idle.pills[0].detail, "in 1h 30m");
  assert.deepEqual(idle.strip.map((s) => s.title), ["A", "B", "C", "D"]);
  const music = collectSlots(ctx("music"));
  assert.equal(music.pills.length, 1); assert.equal(music.strip.length, 0);
  const soon = collectSlots(ctx("soon"));
  assert.equal(soon.pills.length, 0); assert.equal(soon.strip.length, 0);              // the hero is the event itself
});

test("extra info from Permuta: priority order, limits, scenes, expiry", () => {
  const info: SlotItem[] = [
    { id: "p1", zone: "pill", title: "Package delivered", priority: 90 },
    { id: "p2", zone: "pill", title: "Low priority", priority: 10 },
    { id: "p3", zone: "pill", title: "Only at night", scenes: ["night"] },
    { id: "p4", zone: "pill", title: "Expired", until: now - 1 },
  ];
  const s = collectSlots(ctx("idle", { info }));
  assert.deepEqual(s.pills.map((p) => p.id), ["p1", "next-event"]);                    // max two pills, highest priority first
  assert.deepEqual(collectSlots(ctx("night", { info })).pills.map((p) => p.id), ["p1", "p3"]);       // p1 has no scene limit, so it shows everywhere
});

test("badges add up per rail icon; takeover picks the most important live one", () => {
  const info: SlotItem[] = [
    { id: "m1", zone: "badge", title: "mail", rail: "mail", count: 2 }, { id: "m2", zone: "badge", title: "mail", rail: "mail", count: 3 },
    { id: "j", zone: "badge", title: "journal", rail: "journal", dot: true },
    { id: "t1", zone: "takeover", title: "Garage door open", priority: 70 }, { id: "t2", zone: "takeover", title: "Smoke alarm", priority: 99 },
    { id: "t3", zone: "takeover", title: "Old", priority: 100, until: now - 5 },
  ];
  const s = collectSlots(ctx("idle", { info }));
  assert.equal(s.badges.mail?.count, 5); assert.equal(s.badges.mail?.dot, true); assert.equal(s.badges.journal?.dot, true); assert.equal(s.badges.journal?.count, undefined);
  assert.equal(s.takeover?.title, "Smoke alarm");
  assert.equal(collectSlots(ctx("idle")).takeover, null);
});

test("a custom provider plugs in without touching anything else", () => {
  const weatherWarning = () => [{ id: "w", zone: "pill" as const, title: "Frost tonight", priority: 95 }];
  assert.equal(collectSlots(ctx("idle"), [...BUILTIN, weatherWarning]).pills[0].title, "Frost tonight");
});

test("normalizeInfo drops bad items and tidies the rest", () => {
  assert.deepEqual(normalizeInfo(null), []); assert.deepEqual(normalizeInfo({ nope: 1 }), []);
  const out = normalizeInfo({ items: [
    { id: "a", zone: "pill", title: "ok", color: "#12ab34", priority: 500, icon: "mail" },
    { id: "b", zone: "nowhere", title: "bad zone" }, { id: "c", zone: "pill" }, { zone: "pill", title: "no id" },
    { id: "d", zone: "badge", title: "no rail" }, { id: "e", zone: "badge", title: "mail", rail: "mail", count: 2.6, extra: "ignored" },
    { id: "f", zone: "pill", title: "bad colour", color: "red" },
  ] });
  assert.deepEqual(out.map((i) => i.id), ["a", "e", "f"]);
  assert.equal(out[0].priority, 100); assert.equal(out[0].icon, "mail"); assert.equal(out[1].count, 3); assert.equal(out[2].color, undefined);
  assert.equal(normalizeInfo([{ id: "x", zone: "takeover", title: "list form works too" }]).length, 1);
});

test("the rail highlight follows the scene", () => {
  assert.equal(railFor("idle"), "today"); assert.equal(railFor("soon"), "calendar"); assert.equal(railFor("day"), "calendar"); assert.equal(railFor("music"), "music");
  assert.equal(railFor("away"), "home"); assert.equal(railFor("night"), null); assert.equal(railFor("offline"), null);
});
