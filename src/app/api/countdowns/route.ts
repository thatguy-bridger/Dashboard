import { cacheHeaders } from "@/lib/http";
import { NextRequest, NextResponse } from "next/server";
import { listCountdowns, createCountdown } from "@/lib/countdowns";

export async function GET() {
  const countdowns = await listCountdowns();
  return NextResponse.json({ countdowns }, cacheHeaders(120));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.label !== "string" || !body.label.trim() || typeof body.targetDate !== "number") {
    return NextResponse.json({ error: "label and targetDate are required" }, { status: 400 });
  }
  const countdown = await createCountdown(body.label.trim(), body.targetDate);
  return NextResponse.json({ countdown });
}
