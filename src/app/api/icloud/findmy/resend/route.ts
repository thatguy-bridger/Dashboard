import { NextResponse } from "next/server";
import { resendFindMyCode } from "@/lib/icloudSession";

export async function POST() {
  const email = process.env.ICLOUD_EMAIL;
  if (!email) {
    return NextResponse.json({ ok: false, error: "ICLOUD_EMAIL is not configured" }, { status: 400 });
  }

  try {
    await resendFindMyCode(email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
