import { rpc } from "./supabase";

/** The PIN is set in Permuta and checked by the server storage itself (with a lock-out after too many wrong tries). Nothing is stored here. */
export const pinOf = (req: Request) => req.headers.get("x-control-pin") ?? "";
const good = new Map<string, number>();            // a PIN the database just accepted, remembered for 30 seconds so a request costs one database call, not two
export async function allowed(req: Request): Promise<boolean> {
  const pin = pinOf(req);
  if (!pin) return false;
  const until = good.get(pin);
  if (until && until > Date.now()) return true;
  try {
    const ok = (await rpc<boolean>("dash_check", { p_pin: pin })) === true;
    if (ok) { if (good.size > 50) good.clear(); good.set(pin, Date.now() + 30_000); } else good.delete(pin);          // a wrong PIN is never remembered
    return ok;
  } catch { return false; }
}
export const deny = () => Response.json({ error: "locked" }, { status: 401 });
