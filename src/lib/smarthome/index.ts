import { timingSafeEqual } from "crypto";
import { demoProvider } from "./demo";
import { homeAssistantProvider } from "./homeAssistant";
import { applyHomeConfig, getHomeConfig } from "./config";
import type { HomeAction, HomeEntity, HomeProvider, HomeSnapshot, SceneLight } from "./types";

export * from "./types";

export const haConfigured = () => Boolean(process.env.HOME_ASSISTANT_URL && process.env.HOME_ASSISTANT_TOKEN);

/** Real devices when Home Assistant is configured; otherwise the demo devices. */
export function getProvider(): HomeProvider {
  return haConfigured() ? homeAssistantProvider : demoProvider;
}

/** Controlling the house needs a PIN (CONTROL_PIN) once real devices are connected. The app has no
 *  login, so without this anyone who found the URL could flip your lights. Demo mode is open. */
export function checkPin(pin: string | null): "ok" | "needs_pin" | "bad_pin" | "pin_not_configured" {
  if (!haConfigured()) return "ok";
  const expected = process.env.CONTROL_PIN;
  if (!expected) return "pin_not_configured";
  if (!pin) return "needs_pin";
  const a = Buffer.from(pin), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "bad_pin";
}

/** The provider's devices with the dashboard's names, rooms, hidden list and saved scenes applied. */
export async function homeSnapshot(): Promise<HomeSnapshot> {
  const [snap, config] = await Promise.all([getProvider().snapshot(), getHomeConfig()]);
  return { provider: snap.provider, entities: applyHomeConfig(snap.entities, config) };
}

/** Capture what every light is doing right now, for a saved scene. */
export function lightStates(entities: HomeEntity[]): Record<string, SceneLight> {
  const out: Record<string, SceneLight> = {};
  for (const e of entities) {
    if (e.kind !== "light" && e.kind !== "switch") continue;
    out[e.id] = e.on
      ? { on: true, ...(e.brightness != null ? { brightness: e.brightness } : {}), ...(e.colorTemp ? { colorTemp: e.colorTemp } : {}), ...(e.hs ? { hs: e.hs } : {}) }
      : { on: false };
  }
  return out;
}

/** Re-apply a saved scene: lights it left off go off, the rest get their remembered state. */
export async function runScene(lights: Record<string, SceneLight>) {
  const provider = getProvider();
  await Promise.all(
    Object.entries(lights).map(async ([id, l]) => {
      if (!l.on) return provider.act(id, { type: "off" });
      await provider.act(id, { type: "on" });
      if (l.brightness != null) await provider.act(id, { type: "brightness", value: l.brightness });
      if (l.hs) await provider.act(id, { type: "color", h: l.hs[0], s: l.hs[1] });
      else if (l.colorTemp) await provider.act(id, { type: "colorTemp", value: l.colorTemp });
    })
  );
}

export type { HomeAction };
