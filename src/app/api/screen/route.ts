import { allowed, deny, pinOf } from "@/lib/auth";
import { readAll } from "@/lib/supabase";

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
    const kv = await readAll(pinOf(req));
    const v = (k: string) => kv[k]?.v;
    return Response.json({
      screen: v("config:screen") ?? null,
      theme: v("config:theme") ?? null,
      agenda: v("state:agenda") ?? null,
      music: v("state:music") ?? null,
      status: v("state:status") ?? null,
      updatedAt: kv["state:status"]?.at ?? null,
      weather: await weather(v("config:location") as Loc | undefined),
      now: Date.now(),
    });
  } catch { return Response.json({ error: "storage" }, { status: 502 }); }
}
