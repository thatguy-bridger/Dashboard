import { NextResponse } from "next/server";
import { getGoogleStatus, disconnectGoogle } from "@/lib/google";

export async function GET() {
  const status = await getGoogleStatus();
  return NextResponse.json(status);
}

export async function DELETE() {
  await disconnectGoogle();
  return NextResponse.json({ ok: true });
}
