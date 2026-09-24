import { NextRequest, NextResponse } from "next/server";
import { finalizePickerSession } from "@/lib/googlePhotos";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const count = await finalizePickerSession(id);
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
