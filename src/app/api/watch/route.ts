import { allowed, deny } from "@/lib/auth";
import { watch } from "@/lib/ha";
import { memo } from "@/lib/memo";
export const dynamic = "force-dynamic";

/** Are the lights on (in this screen's room, if it names one)? Tiny, and shared by every screen for a few seconds. */
export async function GET(req: Request) {
  if (!(await allowed(req))) return deny();
  const room = (new URL(req.url).searchParams.get("room") ?? "").trim().toLowerCase().slice(0, 40);
  const w = await memo("watch", 8000, watch);
  return Response.json({ reachable: w.reachable, lights: room ? (w.byRoom[room] ?? 0) : w.lights });
}
