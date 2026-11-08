import { cleanPatch, resolveDevice, sanitizeInfo, validDeviceId } from "@/lib/device";
import { pinOf, deny } from "@/lib/auth";
import { rpc } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Per-screen config. POST { op: "ping", id, info } -> this screen's config; POST { op: "self", id, config } -> merges the change and returns the config.
 *  The PIN (x-control-pin) is checked by the server storage functions themselves (with their lock-out); a refusal becomes 401. */
export async function POST(req: Request) {
  const pin = pinOf(req);
  if (!pin) return deny();
  let body: { op?: string; id?: unknown; info?: unknown; config?: unknown };
  try { body = await req.json(); } catch { return Response.json({ error: "bad request" }, { status: 400 }); }
  if (!validDeviceId(body.id)) return Response.json({ error: "bad id" }, { status: 400 });
  try {
    if (body.op === "ping") return Response.json(resolveDevice(await rpc("dash_device_ping", { p_pin: pin, p_id: body.id, p_info: sanitizeInfo(body.info) })));
    if (body.op === "self") return Response.json(resolveDevice(await rpc("dash_device_self", { p_pin: pin, p_id: body.id, p_config: cleanPatch(body.config) })));
    return Response.json({ error: "unknown op" }, { status: 400 });
  } catch (e) {
    const msg = String((e as Error).message);
    return msg.includes(" 403") || msg.includes(" 401") ? deny() : Response.json({ error: "storage" }, { status: 502 });
  }
}
