import { rpc } from "./supabase";

/** The PIN is set in Permuta and checked by the server storage itself (with a lock-out after too many wrong tries). Nothing is stored here. */
export const pinOf = (req: Request) => req.headers.get("x-control-pin") ?? "";
export async function allowed(req: Request): Promise<boolean> {
  const pin = pinOf(req);
  if (!pin) return false;
  try { return (await rpc<boolean>("dash_check", { p_pin: pin })) === true; } catch { return false; }
}
export const deny = () => Response.json({ error: "locked" }, { status: 401 });
