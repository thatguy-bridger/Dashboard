import { NextResponse } from "next/server";
import { createPickerSession } from "@/lib/googlePhotos";

export async function POST() {
  try {
    const session = await createPickerSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "Google is not connected" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
