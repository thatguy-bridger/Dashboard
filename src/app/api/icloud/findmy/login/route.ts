import { NextRequest, NextResponse } from "next/server";
import { startFindMyLogin } from "@/lib/icloudSession";

export async function POST(req: NextRequest) {
  const email = process.env.ICLOUD_EMAIL;
  if (!email) {
    return NextResponse.json({ ok: false, error: "ICLOUD_EMAIL is not configured" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : null;
  if (!password) {
    return NextResponse.json({ ok: false, error: "password is required" }, { status: 400 });
  }

  try {
    const result = await startFindMyLogin(email, password);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[icloud/findmy/login]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
