import type { HomeAction, HomeEntity, HomeProvider, HomeSnapshot } from "./types";

/** Stand-in devices so the touch screen works before Home Assistant is connected.
 *  State lives in this server instance's memory (resets on redeploy / cold start). */
const state: HomeEntity[] = [
  { id: "demo.living_lamp", name: "Floor Lamp", kind: "light", room: "Living Room", available: true, on: true, dimmable: true, brightness: 70 },
  { id: "demo.living_ceiling", name: "Ceiling", kind: "light", room: "Living Room", available: true, on: false, dimmable: true, brightness: 100 },
  { id: "demo.kitchen", name: "Kitchen", kind: "light", room: "Kitchen", available: true, on: true, dimmable: true, brightness: 100 },
  { id: "demo.counter", name: "Under Cabinet", kind: "light", room: "Kitchen", available: true, on: false, dimmable: true, brightness: 60 },
  { id: "demo.bed_lamp", name: "Bedside Lamp", kind: "light", room: "Bedroom", available: true, on: false, dimmable: true, brightness: 40 },
  { id: "demo.porch", name: "Porch", kind: "switch", room: "Outside", available: true, on: false },
  { id: "demo.scene_movie", name: "Movie", kind: "scene", room: "Scenes", available: true },
  { id: "demo.scene_bright", name: "Bright", kind: "scene", room: "Scenes", available: true },
  { id: "demo.scene_goodnight", name: "Goodnight", kind: "scene", room: "Scenes", available: true },
  { id: "demo.scene_away", name: "Away", kind: "scene", room: "Scenes", available: true },
  { id: "demo.speaker", name: "Living Room Speaker", kind: "media", room: "Speakers", available: true, on: true, playing: false, volume: 35, title: null },
  { id: "demo.kitchen_display", name: "Kitchen Display", kind: "media", room: "Speakers", available: true, on: true, playing: false, volume: 50, title: null },
];

function applyScene(id: string) {
  const set = (eid: string, on: boolean, brightness?: number) => {
    const e = state.find((x) => x.id === eid);
    if (e) {
      e.on = on;
      if (brightness != null) e.brightness = brightness;
    }
  };
  const lights = state.filter((e) => e.kind === "light" || e.kind === "switch");
  if (id.endsWith("movie")) {
    lights.forEach((e) => set(e.id, false));
    set("demo.living_lamp", true, 15);
  } else if (id.endsWith("bright")) {
    lights.forEach((e) => set(e.id, true, 100));
  } else {
    lights.forEach((e) => set(e.id, false));
  }
}

export const demoProvider: HomeProvider = {
  name: "demo",
  async snapshot(): Promise<HomeSnapshot> {
    return { provider: "demo", entities: state.map((e) => ({ ...e })) };
  },
  async act(id: string, action: HomeAction) {
    const e = state.find((x) => x.id === id);
    if (!e) throw new Error("unknown device");
    switch (action.type) {
      case "toggle": e.on = !e.on; break;
      case "on": e.on = true; break;
      case "off": e.on = false; break;
      case "brightness": e.brightness = Math.max(1, Math.min(100, Math.round(action.value))); e.on = true; break;
      case "activate": applyScene(id); break;
      case "volume": e.volume = Math.max(0, Math.min(100, Math.round(action.value))); break;
      case "play": e.playing = true; e.on = true; break;
      case "pause": e.playing = false; break;
      default: break; // next/previous: nothing to do in the demo
    }
  },
};
