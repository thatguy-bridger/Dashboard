import { allowed, deny } from "@/lib/auth";
import { home } from "@/lib/ha";
export const dynamic = "force-dynamic";
export async function GET(req: Request) { return (await allowed(req)) ? Response.json(await home()) : deny(); }
