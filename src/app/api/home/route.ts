import { allowed, deny } from "@/lib/auth";
import { home } from "@/lib/ha";
import { memo } from "@/lib/memo";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { return (await allowed(req)) ? Response.json(await memo("home", 2500, home)) : deny(); }
