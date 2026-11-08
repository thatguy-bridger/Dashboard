import test from "node:test";
import assert from "node:assert/strict";
import { buildScreen } from "./screen.ts";
import type { KV } from "./supabase.ts";

const row = (v: unknown, at = "2026-11-07T20:00:00Z") => ({ v, at });
const kv: KV = {
  "config:screen": row({ widgets: ["clock"] }), "config:theme": row({ accent: "#7C8CFF" }), "config:location": row({ lat: 1, lon: 2 }),
  "state:agenda": row({ events: [] }), "state:music": row({ track: "x", trackId: "abc" }), "state:status": row({ at: 5 }, "2026-11-07T20:01:00Z"),
  "state:lyrics": row({ id: "abc", lines: [[1, "hello"]] }), "state:lyrics_next": row({ id: "def", lines: [[2, "next"]] }), "state:lights": row({ on: true, lights: [] }),
  "state:info": row([{ id: "a", zone: "pill", title: "x" }]), "state:school": row({ day: "A" }), "state:mail": row({ unread: 3 }), "state:battery": row({ pct: 50 }),
};

test("/api/screen returns lyrics when state:lyrics exists (this shipped broken once)", () => {
  const r = buildScreen(kv, null, 123);
  assert.deepEqual(r.lyrics, { id: "abc", lines: [[1, "hello"]] });
  assert.deepEqual(r.lyricsNext, { id: "def", lines: [[2, "next"]] });
});
test("lights, info and every other state row come through; known keys are not duplicated into extra", () => {
  const r = buildScreen(kv, { current: {} }, 123);
  assert.deepEqual(r.lights, { on: true, lights: [] }); assert.equal((r.info as unknown[]).length, 1);
  assert.deepEqual(Object.keys(r.extra).sort(), ["battery", "mail", "school"]); assert.deepEqual(r.extra.mail, { unread: 3 });
  assert.equal(r.screen && (r.screen as { widgets: string[] }).widgets[0], "clock"); assert.deepEqual(r.theme, { accent: "#7C8CFF" });
  assert.equal(r.updatedAt, "2026-11-07T20:01:00Z"); assert.equal(r.now, 123); assert.deepEqual(r.weather, { current: {} });
  assert.ok(!("config:location" in r.extra) && !("location" in r.extra));
});
test("missing rows are null, never undefined or a crash", () => {
  const r = buildScreen({}, null, 1);
  for (const k of ["screen", "theme", "lyrics", "lyricsNext", "lights", "info", "agenda", "music", "status", "updatedAt", "weather"] as const) assert.equal(r[k], null, k);
  assert.deepEqual(r.extra, {});
});
