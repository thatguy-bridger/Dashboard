const url = () => process.env.SUPABASE_URL ?? "";
const key = () => process.env.SUPABASE_KEY ?? "";   // the publishable key: safe to be public, it can only call the functions below

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${url()}/rest/v1/rpc/${fn}`, {
    method: "POST", cache: "no-store",
    headers: { apikey: key(), "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`supabase ${fn} ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export type KV = Record<string, { v: unknown; at: string }>;
export const readAll = (pin: string) => rpc<KV>("dash_read", { p_pin: pin });
export const enqueue = (pin: string, cmd: Record<string, unknown>) => rpc("dash_enqueue", { p_pin: pin, p_cmd: cmd });
