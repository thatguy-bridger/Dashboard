import { NextRequest, NextResponse } from "next/server";
import { getPickerSession } from "@/lib/googlePhotos";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const session = await getPickerSession(id);
    if (!session) {
      return NextResponse.json({ ok: false, error: "Google is not connected" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
