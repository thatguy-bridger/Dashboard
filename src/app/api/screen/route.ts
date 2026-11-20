import { allowed, deny, pinOf } from "@/lib/auth";
import { readAll } from "@/lib/supabase";
import { buildScreen } from "@/lib/screen";
import { spotifyNow } from "@/lib/spotify";
import { memo } from "@/lib/memo";

export const dynamic = "force-dynamic";

type Loc = { lat: number; lon: number; name?: string };

async function weather(loc?: Loc) {
  if (!loc) return null;
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code&temperature_unit=fahrenheit&timezone=auto&forecast_days=5`;
    const r = await fetch(u, { next: { revalidate: 600 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** What Permuta saved on the server (layout, live state) plus the weather for the place Permuta says you are. */
export async function GET(req: Request) {
  if (!(await allowed(req))) return deny();
  try {
    const pin = pinOf(req);
    let kv = await memo(`screen:${pin}`, 4000, () => readAll(pin));          // several screens asking at once cost one trip to the database
    const now = Date.now();
    // Permuta reports the music every few seconds while it runs; when it has gone quiet (computer closed) the server asks Spotify itself (and remembers the answer a few seconds).
    const m = kv["state:music"]?.v as { at?: number; track?: string } | undefined;
    if (!m?.track || now - Number(m.at ?? 0) > 150000) { const sp = await memo("spotify", 5000, () => spotifyNow(now)); if (sp) kv = { ...kv, "state:music": { v: sp, at: new Date(now).toISOString() } }; }
    return Response.json(buildScreen(kv, await weather(kv["config:location"]?.v as Loc | undefined), now));
  } catch { return Response.json({ error: "storage" }, { status: 502 }); }
}
