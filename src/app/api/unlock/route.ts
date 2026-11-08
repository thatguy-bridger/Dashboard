import { allowed, deny } from "@/lib/auth";
export async function POST(req: Request) { return (await allowed(req)) ? Response.json({ ok: true }) : deny(); }
