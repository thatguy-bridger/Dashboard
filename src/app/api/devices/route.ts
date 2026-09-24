import { NextRequest, NextResponse } from "next/server";
import { listDevices, touchDevice } from "@/lib/registry";

export async function GET() {
  const devices = await listDevices();
  return NextResponse.json({ devices });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]!.trim() : null;
  const userAgent = req.headers.get("user-agent");
  const touchCapable = Boolean(body.touchCapable);

  const device = await touchDevice({ id, ip, userAgent, touchCapable });
  return NextResponse.json({ device });
}
