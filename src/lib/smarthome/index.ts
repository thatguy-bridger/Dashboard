import { timingSafeEqual } from "crypto";
import { demoProvider } from "./demo";
import { homeAssistantProvider } from "./homeAssistant";
import type { HomeProvider } from "./types";

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
