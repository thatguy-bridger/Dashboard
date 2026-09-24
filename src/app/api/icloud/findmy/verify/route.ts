import { NextRequest, NextResponse } from "next/server";
import { submitFindMyCode } from "@/lib/icloudSession";

export async function POST(req: NextRequest) {
  const email = process.env.ICLOUD_EMAIL;
  if (!email) {
    return NextResponse.json({ ok: false, error: "ICLOUD_EMAIL is not configured" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : null;
  if (!code) {
    return NextResponse.json({ ok: false, error: "code is required" }, { status: 400 });
  }

  try {
    await submitFindMyCode(email, code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[icloud/findmy/verify]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
